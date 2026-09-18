import { notFound, parseBucketPath } from "@/utils/bucket";
import { can_access_path } from "@/utils/auth";
import { verify_share } from "@/utils/share";

// 解析 "bytes=start-end" 形式的 Range 头，返回 R2 get 的 range 选项
// 支持 bytes=a-b / bytes=a- / bytes=-N；全部先 head 拿真实大小，
// 避免 0 字节文件、起点越界等边界情况触发 R2 异常
async function getRangeOption(bucket, key, rangeHeader) {
  if (!rangeHeader) return { range: null, partial: false, size: null };
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return { range: null, partial: false, size: null };
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "")
    return { range: null, partial: false, size: null };

  const head = await bucket.head(key);
  if (!head) return { range: null, partial: false, size: null };
  const size = head.size;

  let offset;
  let length;
  if (startStr === "") {
    // 后缀式：取末尾 N 字节
    length = Math.min(parseInt(endStr), size);
    if (length <= 0) return { range: null, partial: false, size };
    offset = size - length;
  } else {
    offset = parseInt(startStr);
    // 起点越界：按规范应回 416
    if (offset >= size) return { range: null, partial: false, size, unsatisfiable: true };
    if (endStr === "") {
      length = size - offset;
    } else {
      length = Math.min(parseInt(endStr) - offset + 1, size - offset);
      if (length <= 0) return { range: null, partial: false, size };
    }
  }
  return { range: { offset, length }, partial: true, size };
}

export async function onRequestGet(context) {
  const [bucket, targetPath] = parseBucketPath(context);
  if (!bucket) return notFound();
  const path = targetPath || "";

  // 两类放行：目录白名单（登录用户 / GUEST），或有效的分享签名（含密码与过期时间）
  if (
    !can_access_path(context, path) &&
    !(await verify_share(context, path))
  ) {
    const headers = new Headers();
    headers.set("WWW-Authenticate", 'Basic realm="需要登录"');
    return new Response("没有读取权限，或分享链接无效/已过期", {
      status: 401,
      headers,
    });
  }

  // 直接读 R2 绑定，不再转发到 r2.dev 公开地址：
  // 1. 不会把 Authorization/Cookie 等请求头带给第三方
  // 2. 存储桶无需开启公开访问，避免知道 pub-xxx.r2.dev 就绕过所有权限
  // 3. 支持 Range 请求（视频拖动、断点续传）
  const { range, partial, size, unsatisfiable } = await getRangeOption(
    bucket,
    path,
    context.request.headers.get("Range")
  );

  if (unsatisfiable) {
    return new Response("请求范围不满足", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const object = await bucket.get(
    path,
    range ? { range } : {}
  );

  if (!object) return notFound();

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream"
  );
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`
    );
  }
  if (path.startsWith("_$flaredrive$/thumbnails/")) {
    headers.set("Cache-Control", "max-age=31536000");
  }

  return new Response(object.body, {
    headers,
    status: partial && range ? 206 : 200,
    statusText: partial && range ? "Partial Content" : "OK",
  });
}

// HEAD 请求（下载器/播放器探测用）与 GET 共用处理，响应体由运行时自动丢弃
export const onRequestHead = onRequestGet;

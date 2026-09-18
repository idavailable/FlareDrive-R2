import { notFound, parseBucketPath } from "@/utils/bucket";
import { can_access_path, get_auth_status } from "@/utils/auth";

function unauthorized() {
  const header = new Headers();
  header.set("WWW-Authenticate", 'Basic realm="需要登录"');
  return new Response("没有操作权限", { status: 401, headers: header });
}

export async function onRequestPostCreateMultipart(context) {
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  const request: Request = context.request;

  const customMetadata: Record<string, string> = {};
  if (request.headers.has("fd-thumbnail"))
    customMetadata.thumbnail = request.headers.get("fd-thumbnail");

  const multipartUpload = await bucket.createMultipartUpload(path, {
    httpMetadata: {
      contentType: request.headers.get("content-type"),
    },
    customMetadata,
  });

  return new Response(
    JSON.stringify({
      key: multipartUpload.key,
      uploadId: multipartUpload.uploadId,
    })
  );
}

export async function onRequestPostCompleteMultipart(context) {
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  const request: Request = context.request;
  const url = new URL(request.url);
  const uploadId = new URLSearchParams(url.search).get("uploadId");
  const multipartUpload = await bucket.resumeMultipartUpload(path, uploadId);

  const completeBody: { parts: Array<any> } = await request.json();

  try {
    const object = await multipartUpload.complete(completeBody.parts);
    return new Response(null, {
      headers: { etag: object.httpEtag },
    });
  } catch (error: any) {
    return new Response(error.message, { status: 400 });
  }
}

export async function onRequestPost(context) {
  // 补上原先缺失的鉴权：分片上传的创建/完成也必须校验路径权限
  if (!get_auth_status(context)) return unauthorized();

  const url = new URL(context.request.url);
  const searchParams = new URLSearchParams(url.search);

  if (searchParams.has("uploads")) {
    return onRequestPostCreateMultipart(context);
  }

  if (searchParams.has("uploadId")) {
    return onRequestPostCompleteMultipart(context);
  }

  return new Response("Method not allowed", { status: 405 });
}

export async function onRequestPutMultipart(context) {
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  const request: Request = context.request;
  const url = new URL(request.url);

  const uploadId = new URLSearchParams(url.search).get("uploadId");
  const multipartUpload = await bucket.resumeMultipartUpload(path, uploadId);

  const partNumber = parseInt(
    new URLSearchParams(url.search).get("partNumber")
  );
  const uploadedPart = await multipartUpload.uploadPart(
    partNumber,
    request.body
  );

  return new Response(null, {
    headers: {
      "Content-Type": "application/json",
      etag: uploadedPart.etag,
    },
  });
}

export async function onRequestPut(context) {
  if(!get_auth_status(context)){
    return unauthorized();
  }
  const url = new URL(context.request.url);

  if (new URLSearchParams(url.search).has("uploadId")) {
    return onRequestPutMultipart(context);
  }

  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  const request: Request = context.request;

  let content = request.body;
  const customMetadata: Record<string, string> = {};

  if (request.headers.has("x-amz-copy-source")) {
    // 复制操作：源路径与目标路径都要有权限，防止把无权读取的文件复制到自己的目录
    let sourceName;
    try {
      sourceName = decodeURIComponent(request.headers.get("x-amz-copy-source"));
    } catch (e) {
      return new Response("copy-source 编码无效", { status: 400 });
    }
    if (!can_access_path(context, sourceName)) return unauthorized();

    // 优先用 R2 服务端复制（不把文件流过 Worker，大文件更快也不受内存/CPU 限制）
    try {
      await bucket.copy(path, sourceName);
      const copied = await bucket.head(path);
      if (copied) {
        const { key, size, uploaded } = copied;
        return new Response(JSON.stringify({ key, size, uploaded }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      // 运行时不支持 bucket.copy 时退回流式复制
    }

    const source = await bucket.get(sourceName);
    if (!source) return new Response("源文件不存在", { status: 404 });
    content = source.body;
    if (source.customMetadata.thumbnail)
      customMetadata.thumbnail = source.customMetadata.thumbnail;
  }

  if (request.headers.has("fd-thumbnail"))
    customMetadata.thumbnail = request.headers.get("fd-thumbnail");

  const obj = await bucket.put(path, content, { customMetadata });
  const { key, size, uploaded } = obj;
  return new Response(JSON.stringify({ key, size, uploaded }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestDelete(context) {
  if(!get_auth_status(context)){
    return unauthorized();
  }
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  await bucket.delete(path);
  return new Response(null, { status: 204 });
}

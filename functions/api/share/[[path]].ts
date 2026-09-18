import { make_share_sign } from "@/utils/share";

// 生成分享链接（需登录）：
//   GET /api/share/?path=文件key&days=有效期天数&password=可选密码
// 返回 { url: "/share.html?p=..&e=..&s=.." }，签名 = HMAC(路径:过期时间:密码)
// 访客不知道密码就拼不出有效签名，密码错误时 /raw/ 端校验必然失败。
export async function onRequestGet(context) {
  const authorization = context.request.headers.get("Authorization");
  let account = null;
  if (authorization && authorization.startsWith("Basic ")) {
    account = atob(authorization.split("Basic ")[1]);
  }
  if (!account || !context.env[account]) {
    return new Response("需要登录后才能生成分享链接", { status: 401 });
  }

  const url = new URL(context.request.url);
  const path = url.searchParams.get("path");
  const days = parseFloat(url.searchParams.get("days") || "7");
  const password = url.searchParams.get("password") || "";

  if (!path) return new Response("缺少 path 参数", { status: 400 });
  if (!(days > 0) || days > 3650) {
    return new Response("有效期不合法（应为 0 ~ 3650 之间的天数）", {
      status: 400,
    });
  }

  const exp = Math.floor(Date.now() / 1000 + days * 86400);
  const sign = await make_share_sign(context.env, path, String(exp), password);
  const shareUrl = `/share.html?p=${encodeURIComponent(path)}&e=${exp}&s=${sign}`;

  return new Response(JSON.stringify({ url: shareUrl, exp }), {
    headers: { "Content-Type": "application/json" },
  });
}

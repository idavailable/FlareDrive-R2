// 分享链接签名工具（方案 B：无状态 HMAC，签名材料 = 路径:过期时间:密码）
// 生成分享链接时服务器算好 sign 放进 URL；访客下载时带上 pw 参数，
// /raw/ 端用相同材料重算 HMAC 比对 —— 密码不对则签名必不匹配。

export async function get_share_secret(env) {
  // 优先用显式配置的 SHARE_SECRET；否则退化用第一个用户凭据环境变量名（如 "admin:123456"），
  // 保证开箱即用，但仍建议在 Pages 环境变量里显式设置 SHARE_SECRET
  if (env["SHARE_SECRET"]) return env["SHARE_SECRET"];
  const userKey = Object.keys(env).find((key) => key.includes(":"));
  return userKey || "flaredrive-fallback-secret";
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function make_share_sign(env, path, exp, password) {
  return hmacHex(await get_share_secret(env), `${path}:${exp}:${password}`);
}

export async function verify_share(context, path) {
  const url = new URL(context.request.url);
  const sign = url.searchParams.get("s");
  const exp = url.searchParams.get("e");
  const password = url.searchParams.get("pw") || "";
  const id = url.searchParams.get("id");
  if (!sign || !exp) return false;
  if (Date.now() / 1000 > Number(exp)) return false;
  const expected = await make_share_sign(context.env, path, exp, password);
  if (expected.length !== sign.length) return false;
  // 恒定时间比较，避免时序侧信道
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sign.charCodeAt(i);
  }
  if (diff !== 0) return false;

  // 绑定了 SHARE_KV 时，分享必须存在对应记录（撤销 = 删除记录，立即失效）
  const kv = context.env["SHARE_KV"];
  if (kv) {
    if (!id) return false;
    const kvKey = `share:${id}:${exp}:${encodeURIComponent(path)}`;
    const stored = await kv.get(kvKey);
    if (stored === null) return false;
  }
  return true;
}

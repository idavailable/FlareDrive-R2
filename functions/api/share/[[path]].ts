import { make_share_sign } from "@/utils/share";
import { account_exists } from "@/utils/auth";

// 分享链接管理（需登录）。三种模式：
//   创建: GET /api/share/?path=..&days=..&password=..        → 生成链接（绑定 SHARE_KV 时写入记录，可撤销）
//   列表: GET /api/share/?list=1[&cursor=..]                 → 列出所有分享记录
//   撤销: GET /api/share/?revoke=1&key=<KV键名>              → 删除记录，链接立即失效
//
// KV 键名格式: share:<id>:<exp>:<encodeURIComponent(路径)>
// 值: {"sign": 签名, "created": 创建时间}；写入时设置 expiration=exp 到期自动清除

function randomId() {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet(context) {
  const authorization = context.request.headers.get("Authorization");
  let account = null;
  if (authorization && authorization.startsWith("Basic ")) {
    try {
      account = atob(authorization.split("Basic ")[1]);
    } catch (e) {
      account = null;
    }
  }
  if (!account || !account_exists(context, account)) {
    return new Response("需要登录后才能管理分享链接", { status: 401 });
  }

  const url = new URL(context.request.url);
  const kv = context.env["SHARE_KV"];

  // ── 列表模式 ──
  if (url.searchParams.has("list")) {
    if (!kv) return new Response("未绑定 SHARE_KV，无法管理分享", { status: 500 });
    const cursor = url.searchParams.get("cursor") || undefined;
    const result = await kv.list({ prefix: "share:", cursor });
    const shares = [];
    for (const k of result.keys) {
      // share:<id>:<exp>:<encPath>（encodeURIComponent 会编码冒号，safe split）
      const parts = k.name.split(":");
      if (parts.length < 4) continue;
      const value = await kv.get(k.name);
      let sign = "";
      let created = null;
      try {
        const parsed = JSON.parse(value);
        sign = parsed.sign || "";
        created = parsed.created || null;
      } catch (e) {}
      shares.push({
        key: k.name,
        id: parts[1],
        exp: parseInt(parts[2]),
        path: decodeURIComponent(parts.slice(3).join(":")),
        sign,
        created,
      });
    }
    return new Response(
      JSON.stringify({
        shares,
        cursor: result.list_complete ? null : result.cursor,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ── 撤销模式 ──
  if (url.searchParams.has("revoke")) {
    if (!kv) return new Response("未绑定 SHARE_KV，无法撤销分享", { status: 500 });
    const key = url.searchParams.get("key") || "";
    if (!key.startsWith("share:")) {
      return new Response("无效的分享记录", { status: 400 });
    }
    await kv.delete(key);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 创建模式 ──
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
  let shareUrl = `/share.html?p=${encodeURIComponent(path)}&e=${exp}&s=${sign}`;

  // 绑定 SHARE_KV 时写入分享记录（到期自动清除）
  let id = null;
  if (kv) {
    id = randomId();
    const kvKey = `share:${id}:${exp}:${encodeURIComponent(path)}`;
    await kv.put(
      kvKey,
      JSON.stringify({ sign, created: Math.floor(Date.now() / 1000) }),
      { expiration: exp }
    );
    shareUrl += `&id=${id}`;
  }

  return new Response(JSON.stringify({ url: shareUrl, exp, id }), {
    headers: { "Content-Type": "application/json" },
  });
}

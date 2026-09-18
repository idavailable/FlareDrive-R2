const THUMBNAIL_PREFIX = "_$flaredrive$/thumbnails/";

function parseAllowList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function matchesAllowList(targetPath, allowList) {
  if (allowList.includes("*")) return true;
  return allowList.some((allow) => targetPath.startsWith(allow));
}

function getAllowListForRequest(context) {
  const headers = new Headers(context.request.headers);
  const authorization = headers.get("Authorization");
  if (authorization && authorization.startsWith("Basic ")) {
    const account = atob(authorization.split("Basic ")[1]);
    if (account && context.env[account]) {
      return parseAllowList(context.env[account]);
    }
  }
  if (context.env["GUEST"]) {
    return parseAllowList(context.env["GUEST"]);
  }
  return null;
}

export function can_access_path(context, targetPath) {
  if (targetPath.startsWith(THUMBNAIL_PREFIX)) return true;
  const allowList = getAllowListForRequest(context);
  if (!allowList) return false;
  return matchesAllowList(targetPath, allowList);
}

// 解析 Basic 认证中的账号（"用户名:密码"），未登录或凭据无效返回 null
export function get_basic_account(context) {
  const authorization = context.request.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Basic ")) return null;
  try {
    const account = atob(authorization.split("Basic ")[1]);
    return account && context.env[account] ? account : null;
  } catch (e) {
    return null;
  }
}

// 管理员 = allowlist 为 "*" 的账号；高危接口（S3 代理、桶列表）仅对管理员开放
export function is_admin(context) {
  const account = get_basic_account(context);
  return account !== null && context.env[account] === "*";
}

export function get_allow_list(context) {
  return getAllowListForRequest(context);
}

export function get_auth_status(context) {
  const dopath = context.request.url.split("/api/write/items/")[1];
  if (!dopath) return false;
  return can_access_path(context, dopath);
}

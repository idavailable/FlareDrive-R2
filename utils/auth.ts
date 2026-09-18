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

// 账号支持两种存储方式：
// 1. 老方式：变量名即账号（如 "admin:123456"）——新版控制台会提示"无效"，随时可能被彻底禁掉
// 2. 新方式（推荐）：USERS 变量，JSON 格式：
//    {"admin:123456": "*", "user1:123456": "user1/,shared/"}
function getUsersMap(env) {
  if (!env["USERS"]) return {};
  try {
    const parsed = JSON.parse(env["USERS"]);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function getAllowListForAccount(context, account) {
  if (!account) return null;
  if (context.env[account]) return parseAllowList(context.env[account]);
  const users = getUsersMap(context.env);
  if (users[account]) return parseAllowList(users[account]);
  return null;
}

function getRawBasicAccount(context) {
  const authorization = context.request.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Basic ")) return null;
  try {
    return atob(authorization.split("Basic ")[1]) || null;
  } catch (e) {
    return null;
  }
}

function getAllowListForRequest(context) {
  const allowList = getAllowListForAccount(context, getRawBasicAccount(context));
  if (allowList) return allowList;
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

// 账号是否有效（兼容老方式变量名与新方式 USERS JSON）
export function account_exists(context, account) {
  return getAllowListForAccount(context, account) !== null;
}

// 解析 Basic 认证中的账号（"用户名:密码"），未登录或凭据无效返回 null
export function get_basic_account(context) {
  const account = getRawBasicAccount(context);
  return account !== null && account_exists(context, account) ? account : null;
}

// 管理员 = allowlist 为 "*" 的账号；高危接口（S3 代理、桶列表）仅对管理员开放
export function is_admin(context) {
  const account = getRawBasicAccount(context);
  if (account === null) return false;
  if (context.env[account] === "*") return true;
  const users = getUsersMap(context.env);
  return users[account] === "*";
}

export function get_allow_list(context) {
  return getAllowListForRequest(context);
}

export function get_auth_status(context) {
  const dopath = context.request.url.split("/api/write/items/")[1];
  if (!dopath) return false;
  return can_access_path(context, dopath);
}

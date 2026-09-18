export function notFound() {
  return new Response("Not found", { status: 404 });
}

// 逐段解码：避免对整条路径解码时，文件名里的 %2F 变成路径分隔符（路径混淆），
// 也避免文件名含 % 时 decodeURIComponent 抛异常导致 500
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (e) {
    return segment;
  }
}

export function parseBucketPath(context): [any, string] {
  const { request, env, params } = context;
  const url = new URL(request.url);

  const pathSegments = (params.path || []) as String[];
  const path = pathSegments.map(safeDecode).join("/");
  const driveid = url.hostname.replace(/\..*/, "");

  return [env[driveid] || env["BUCKET"], path];
}

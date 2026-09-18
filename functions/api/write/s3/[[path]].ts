import { S3Client } from "@/utils/s3";
import { is_admin } from "@/utils/auth";

// 高危接口：此路由会用账号级 AWS 密钥签名并转发任意 S3 请求，
// 必须仅限管理员（allowlist 为 "*" 的账号）访问。
export async function onRequest(context) {
  if (!is_admin(context)) {
    const header = new Headers();
    header.set("WWW-Authenticate", 'Basic realm="需要登录"');
    return new Response("没有操作权限", { status: 401, headers: header });
  }

  const { request, env } = context;

  const client = new S3Client(env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY);
  const forwardUrl = request.url.replace(
    /.*\/api\/write\/s3\//,
    `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/`
  );

  return client.s3_fetch(forwardUrl, {
    method: request.method,
    body: request.body,
    headers: request.headers,
  });
}

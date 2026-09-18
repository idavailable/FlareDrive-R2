import { S3Client } from "@/utils/s3";
import { is_admin } from "@/utils/auth";

// 会泄露账号下所有桶名并触发账号级 S3 请求，仅限管理员访问
export async function onRequestGet(context) {
  if (!is_admin(context)) {
    const header = new Headers();
    header.set("WWW-Authenticate", 'Basic realm="需要登录"');
    return new Response("没有操作权限", { status: 401, headers: header });
  }

  try {
    const { request, env } = context;

    const url = new URL(request.url);
    if (url.searchParams.has("current")) return await getCurrentBucket(context);

    const client = new S3Client(
      env.AWS_ACCESS_KEY_ID,
      env.AWS_SECRET_ACCESS_KEY
    );
    return client.s3_fetch(
      `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/`
    );
  } catch (e) {
    return new Response(e.toString(), { status: 500 });
  }
}

async function getCurrentBucket(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const driveid = url.hostname.replace(/\..*/, "");

  const binding = env[driveid] || env["BUCKET"];
  if (!binding) return new Response("未绑定 R2 存储桶", { status: 500 });

  if (!(await binding.head("_$flaredrive$/CNAME")))
    await binding.put("_$flaredrive$/CNAME", url.hostname);

  const client = new S3Client(env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY);
  const bucketsResponse = await client.s3_fetch(
    `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/`
  );
  const bucketsText = await bucketsResponse.text();
  const bucketNames = [
    ...bucketsText.matchAll(/<Name>([0-9a-z-]*)<\/Name>/g),
  ].map((match) => match[1]);
  try {
    const currentBucket = await Promise.any(
      bucketNames.map(
        (name) =>
          new Promise<string>((resolve, reject) => {
            client
              .s3_fetch(
                `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${name}/_$flaredrive$/CNAME`
              )
              .then((response) => response.text())
              .then((text) => {
                if (text === url.hostname) resolve(name);
                else reject();
              })
              .catch(() => reject());
          })
      )
    );

    return new Response(currentBucket, {
      headers: { "cache-control": "max-age=604800" },
    });
  } catch (e) {
    // 所有桶都没有匹配的 CNAME（包括桶列表为空的情况）
    return new Response("未找到当前域名对应的存储桶", { status: 404 });
  }
}

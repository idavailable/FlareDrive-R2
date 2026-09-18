## FlareDrive-R2 使用文档

### 🌟 项目简介

FlareDrive-R2 是基于 Cloudflare R2 + Workers 构建的在线网盘系统，支持：
- 文件上传/下载/分享
- 多用户权限管理
- 目录级访问控制
- 静态文件托管

> 📌 本项目修改自 [Cloudflare-R2-oss](https://github.com/ljxi/Cloudflare-R2-oss)，实现了更加美观的前端页面，本人并不擅长`CF Worker`开发，所以如果有功能方面的需求，请在上游仓库提出。

### 🚀 快速部署

### 前置要求

- Cloudflare 账号
- 已开通 R2 服务

### 部署步骤

### 1. 准备存储桶

前往 Cloudflare R2 控制台：

1. 新建存储桶（建议名称全小写）

   ![QQ_1744351903148](docs/create-bucket.png)

2. **无需开启「公开访问」（r2.dev）**。新版下载直接走 R2 绑定，不开公开访问更安全——否则任何知道 `pub-xxx.r2.dev` 地址的人可以绕过网盘的所有权限直接下载整个桶。

   > 如果你以前开启过公开访问，建议在存储桶设置里关掉。

### 2. 部署 Pages 服务

1. Fork 本项目仓库到你的 GitHub
2. 打开 Cloudflare Pages，新建一个站点
3. 点击「连接到 Git」并选择你的仓库
4. 保持默认的构建设置即可，第一次构建不会显示内容，为正常现象

### 3. 配置环境变量

![QQ_1744352357624](docs/secret.png)

在 Cloudflare Pages 项目中，进入 **Settings → Environment Variables** 添加以下变量：

| 变量名         | 示例值                                                | 是否必要 | 说明                                           |
| -------------- | ----------------------------------------------------- | -------- | ---------------------------------------------- |
| `admin:123456` | `*`                                                   | 二选一   | 老方式：变量名即账号。新版控制台可能提示"无效"，推荐改用 `USERS` |
| `USERS`        | `{"admin:123456": "*", "user1:123456": "user1/,shared/"}` | 二选一 | 新方式（推荐）：JSON 存所有账号，变量名合规不受控制台校验限制 |
| `GUEST`        | `public/`                                             | ❌ 可选   | 游客可读写的默认目录                             |
| `SHARE_SECRET` | 任意随机长字符串                                       | ❌ 可选   | 分享链接签名密钥；不设置时自动使用管理员凭据变量名作为密钥 |

<p style="color: red !important; font-weight: bold;">
  ⚠️ 请勿开启 R2 存储桶的公开读写权限！否则你的存储资源可能会被恶意刷爆。
</p>

### 4. 绑定 R2 存储桶与 KV（可选）

部署完成后：

1. 进入 Cloudflare Pages 项目设置
2. 点击「R2 存储桶」，添加一个绑定，变量名填写为：

```
BUCKET
```

并选择你的 R2 存储桶。

3. （可选）如需「我的分享」管理功能（查看/复制/撤销分享链接）：
   - 先在 Cloudflare 控制台「存储和数据库 → KV」创建一个命名空间
   - 回到 Pages 设置 → 「函数」→「KV 命名空间绑定」，添加绑定，变量名填写为：

```
SHARE_KV
```

   - 绑定后创建的分享会写入记录，菜单「我的分享」可查看与撤销；撤销后链接立即失效，过期记录自动清除
   - 未绑定时分享功能照常可用（纯签名、到期自动失效，但无法查看与撤销）

### 5. 重新部署项目

完成所有设置后，回到 Pages 控制台，点击「Deployments」页面右上角的「Trigger Redeploy」以重新部署服务。

### ⚙️ 自定义配置

#### 前端样式修改

由于 Wrangler 部署无法使用传统环境变量注入，我偷懒了，不想写环境变量，但是仍然可以简单的进行修改，请直接修改以下文件：

1. **背景图片**  
   修改文件：`assets/App.vue`  
   
   ```vue
   // 约第 213 行
   export default {
     data: () => ({
       ...
       backgroundImageUrl: "/assets/bg-light.webp"
     }),
   }
   ```
   
2. **页脚链接**  
   修改文件：`assets/Footer.vue`  
   
   ```html
   // 约第四十行
   <script>
   export default {
     name: "Footer",
     data() {
       return {
         homeUrl: "https://www.liushen.fun/",
         blogUrl: "https://blog.liushen.fun/",
         githubUrl: "https://github.com/willow-god",
         emailUrl: "mailto:01@liushen.fun"
       };
     }
   };
   </script>
   ```

#### 权限配置技巧

- 使用 `*` 作为值表示拥有所有目录权限
- 目录名必须以 `/` 结尾
- 避免在值的前后添加多余逗号（如 `,dir1/,` 会错误授予全部权限）

### 🔧 故障排查

1. 文件上传失败：
   - 检查 R2 存储桶是否已绑定
   - 确认用户有目标目录的写入权限

2. 样式未更新：
   - 清除浏览器缓存
   - 确认修改已提交并重新部署


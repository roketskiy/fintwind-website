# 应用活跃统计

## 查看统计

统计页入口为 `https://fintwind.xyz/admin/`。未登录时跳转到 `/admin/login/`，输入管理员密码后显示今日 DAU、昨日 DAU、日活趋势和每日明细。默认最近 30 天，可切换 7、30、90 天，并支持刷新和退出登录。查看统计不需要编写 SQL。

首次上线前需要设置管理员密码并完成迁移。配置缺失时页面和数据接口返回 503，不开放统计内容。

DAU 表示按北京时间归日、当天成功上报的独立桌面数据目录数量。同一份数据库多次启动只计一次。它不是自然人数。同一人多个数据目录分别计数，复制数据库会复制身份。应用持续运行而未重新启动的日期不计活跃。离线启动和请求失败不补报。

## 管理员登录

管理员密码保存在 Worker secret `ADMIN_PASSWORD` 中，至少 16 个字符。密码只用于登录校验，不写入仓库。

```sh
bunx wrangler secret put ADMIN_PASSWORD
```

登录成功后 Worker 设置 `__Host-fintwind_admin` 会话 Cookie，带 `Secure`、`HttpOnly`、`SameSite=Strict`，有效期 12 小时。会话记录写入 D1 的 `admin_sessions` 表，只保存令牌的 HMAC-SHA256 摘要，不保存原始令牌。退出登录删除当前会话，修改密码使所有旧会话立即失效。

登录接口要求同源 `Origin`、`application/json` 和不超过 1 KiB 的请求体。每个客户端 IP 每分钟最多尝试 5 次，超过时返回 429。`wrangler.jsonc` 中的 `ADMIN_LOGIN_LIMITER` 提供该限制，缺少绑定时登录返回 503。

Worker 对 `/admin`、`/admin/*` 和 `/api/admin/*` 先鉴权。页面返回 302 跳转到登录页，数据接口返回 401。管理页面和接口均禁止缓存并标记 `noindex`。直接访问 workers.dev 也不能绕过登录。官网首页和公开上报接口不受影响。

## 上报与存储

stable 和 beta 在每次启动时发送 `POST https://fintwind.xyz/api/activity`。Debug 仅在本地生成 UUID，不发送生产统计。消息只包含本地数据库中的随机 UUID v4。

```json
{"installation_id":"c6d4738e-a976-4e44-89cb-8524ac90e8ee"}
```

Worker 按服务端北京时间归日，先对 UUID 做 SHA-256，再以日期和摘要的联合主键写入 D1。同一安装当天多次打开或并发上报只计一次。数据库只保存日期和摘要，不保存原始 UUID、IP、会话、模型或用户内容。Worker 不记录请求体和请求头，关闭自动 invocation 日志与 traces。Cloudflare 平台自身的请求处理和留存由 Cloudflare 账户设置决定。

公开匿名接口不能证明请求来自官方安装，伪造 UUID 的请求可能抬高统计。

## 数据库配置与部署

现有生产 D1 `fintwind-activity` 已于 2026-10-22 创建、绑定并应用 `0001_daily_activity.sql`。`0002_admin_sessions.sql` 是管理员会话所需的增量迁移。其他账户首次配置时执行以下命令。

```sh
bun install --frozen-lockfile
bunx wrangler d1 create fintwind-activity
```

将新环境返回的 ID 填入 `d1_databases[0].database_id`，保留 `ACTIVITY_DB` 绑定，再迁移。现有环境重复应用迁移不会删除数据。

```sh
bunx wrangler d1 migrations apply fintwind-activity --remote
bunx wrangler secret put ADMIN_PASSWORD
bun run types:worker
bun run check
bun run build
bunx wrangler deploy
```

`wrangler.jsonc` 将 `ADMIN_PASSWORD` 列为必需 secret，将 `ADMIN_LOGIN_LIMITER` 列在 `ratelimits` 中。部署后检查未登录访问 `/admin/` 会跳转到登录页，`/admin/api/dau` 返回 401，错误密码返回 401，首页和 `/api/activity` 仍可公开使用。

官网 main 分支 push 会触发 Workers Builds。生产 secret 与 D1 迁移仍需按上述命令执行。

## 本地验证

```sh
bun run check
bun run build
bun run test:activity
```

黑盒脚本使用真实 Workers 运行时、本轮独立 D1 数据目录和随机端口。覆盖公开上报、UUID 校验、并发去重、持久化、密码登录、错误密码、登录限流、Origin 校验、会话过期、退出、密码轮换、路径别名、禁止缓存、连续日期补零、范围限制和数据库故障。只通过本轮持有的实例关闭进程，不访问云端资源或已有应用数据，不进行视觉测试或运行 watcher。

跨仓库验证使用应用仓库构建的探针，调用真实 Rust 上报模块，不启动或操作原生 GUI。

```sh
node scripts/verify-activity.mjs --app-probe /absolute/path/to/activity_blackbox.exe
```

实现依据 [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)、[D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) 和 [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。

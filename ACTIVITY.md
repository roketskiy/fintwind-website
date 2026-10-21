# 应用活跃统计

Fintwind 的 stable 和 beta 在每次进程启动时发送一次 `POST https://fintwind.xyz/api/activity`。消息只包含本地数据库中的随机 UUID v4。

```json
{"installation_id":"c6d4738e-a976-4e44-89cb-8524ac90e8ee"}
```

Worker 按服务端北京时间归日，先对 UUID 做 SHA-256，再以日期和摘要的联合主键写入 D1。同一安装当天多次打开或并发上报只计一次。数据库只保存日期和摘要，不保存原始 UUID、IP、会话、模型或用户内容。Worker 不记录请求体和请求头，关闭自动 invocation 日志与 traces。Cloudflare 平台自身的请求处理和留存由 Cloudflare 账户设置决定。

DAU 表示当天成功上报的活跃安装数。它不是人数，同一人多个安装会分别计数。应用持续运行而未重新启动的日期不计活跃。离线启动和请求失败不计数，不补报。公共接口不能验证真实安装，伪造 UUID 的请求可能抬高统计。

## 首次配置

生产数据库已于 2026-10-22 创建并绑定，`database_id` 已写入配置。现有环境无需重新创建数据库。以下步骤仅用于初始化其他账户或环境。

```sh
bun install --frozen-lockfile
bunx wrangler d1 create fintwind-activity
```

新环境中，把返回的数据库 ID 写入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，保留 `ACTIVITY_DB` 绑定。先迁移再部署。现有生产环境已完成迁移，无需管理员密码、Cloudflare Access 或自建后台。

```sh
bunx wrangler d1 migrations apply fintwind-activity --remote
bun run types:worker
bun run check
bunx astro build
bunx wrangler deploy
```

Workers Builds 仍使用 `bun install --frozen-lockfile && bunx astro build` 构建，部署命令使用 `bunx wrangler deploy`。合并或 push 连接的分支会触发部署，因此在 push 前完成 D1 配置与迁移。

## 查看 DAU

登录 Cloudflare 控制台，打开 Storage & databases → D1 → fintwind-activity → Studio。Cloudflare 账户权限控制访问，网站不提供统计查询接口。

今日 DAU，没有上报时返回 0。

```sql
SELECT COUNT(*) AS dau
FROM daily_activity
WHERE day = date('now', '+8 hours');
```

历史每日 DAU，只返回有上报的日期。

```sql
SELECT day, dau FROM daily_active_users ORDER BY day DESC LIMIT 90;
```

最近 30 天，补齐没有上报的日期。

```sql
WITH RECURSIVE days(day) AS (
  SELECT date('now', '+8 hours', '-29 days')
  UNION ALL
  SELECT date(day, '+1 day') FROM days WHERE day < date('now', '+8 hours')
)
SELECT days.day, COALESCE(activity.dau, 0) AS dau
FROM days LEFT JOIN daily_active_users AS activity ON days.day = activity.day
ORDER BY days.day;
```

## 本地验证

```sh
bun run check
bunx astro build
bun run test:activity
```

黑盒脚本在真实 Workers 运行时和本地 D1 上发送 HTTP 请求。它创建本轮独立临时目录，使用环境白名单，使用随机端口，只通过本轮持有的 Miniflare 实例关闭 workerd。验证并发去重、不同安装、大小写归一、严格消息校验、摘要存储、北京时间归日、重启持久化、数据库失败和首页静态资源回退，不访问云资源或已有应用数据。

跨仓库验证可使用应用仓库构建的探针。

探针调用真实 Rust 上报模块，验证数据库 UUID 到 Worker 和 D1 的链路。它不启动或操作原生 GUI。

```sh
node scripts/verify-activity.mjs --app-probe /absolute/path/to/activity_blackbox.exe
```

接口实现和配置依据 [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)、[D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) 和 [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)。

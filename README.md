# Fintwind 产品落地页

中文静态站点，使用 Astro、原生 CSS 与 TypeScript。调研与产品依据见 [RESEARCH.md](RESEARCH.md)，本次检查结果见 [VALIDATION.md](VALIDATION.md)。

## 构建与预览

在仓库根目录执行：

```sh
bun install
bun run build
bun run preview
```

打开 <http://127.0.0.1:4173>。`preview` 只服务构建产物，不启动 watcher。

构建需要可运行的 FFmpeg（放在 PATH 中，或设置 `FFMPEG_PATH` 为可执行文件绝对路径）。构建时从仓库的 `page/` 读取原始素材，生成 `public/media/`：截图转换为 WebP，`page/会话演示.mp4` 转换为无音轨、支持快速起播的 `session-demo.mp4`，并抽取 `session-demo-poster.webp` 封面。视频处理结果按源素材与脚本修改时间缓存。最终输出到 `website/dist/`，可部署到任意静态站点服务。原始素材需随源码提供。

`public/media/` 的生成产物**提交入库**：Cloudflare Pages 等托管构建环境没有 FFmpeg，入库后部署构建可直接使用现成产物（部署构建命令跳过素材脚本，只执行 `astro build`）。更新原始素材后，在本地运行 `bun run build` 重新生成，并把 `public/media/` 的变更一并提交。

## 部署

仓库连接 Cloudflare（Workers Builds）后自动部署：构建命令 `bun install --frozen-lockfile && bunx astro build`，部署命令 `npx wrangler deploy`，由根目录的 `wrangler.jsonc` 声明 `dist/` 为静态资源目录。

若部署到子路径，在构建环境中设置 `SITE_BASE`（例如 `/fintwind/`）。若使用 Open Graph 社交分享图，部署时可按最终域名补充绝对 `og:image` URL；页面未假设尚未提供的正式域名。

## 检查

在仓库根目录执行：

```sh
bun run check
bunx playwright install chromium
bun run build
bun run test:e2e
bun run audit
```

- E2E：`playwright-report/index.html`、`reports/e2e.json`。
- Lighthouse：`reports/lighthouse.html`、`reports/lighthouse.json`。审计脚本临时启动本地静态服务器及无头浏览器，退出时清理；不生成页面截图。
- 检查包含截图直接展示、键盘打开原图与焦点返回、静音自动播放、点击和触摸不暂停、视口外暂停、减弱动态效果、x64/ARM64 真实下载路径、固定白色主题与 WCAG AA 检查。使用完整 Chromium 验证 MP4 实际解码播放。

## 内容维护

- 产品内容、FAQ 与发布版本：`src/data/product.ts`。
- 页面结构：`src/pages/index.astro`。
- 白色主题、设计 token、响应式布局：`src/styles/site.css`。
- 自动演示、原图弹窗、下载架构：`src/scripts/site.ts`。
- 素材映射、WebP 生成与视频压缩：`scripts/prepare-assets.mjs`。

下载链接固定到已核实的 v0.2.1。升级时同步 `version`、兼容版本说明和 FAQ。页面不展示具体内存或性能数字。演示为非交互的静音循环视频，没有播放器控制条或点击、快捷键暂停行为；离开视口、切到后台或打开原图弹窗时自动暂停，减弱动态效果模式显示静帧。

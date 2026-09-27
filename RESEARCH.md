# Fintwind 落地页调研与设计依据

调研日期：2026-09-27。网页结论来自当日官方页面的 HTML、文案、媒体标签与样式源码；产品结论来自当前仓库和 `page/` 原始素材。

## 从访客要做的决定出发

一个已使用 OpenCode 的 Windows 用户，需要依次判断：

1. 这是给谁的，能改善什么？首屏明确 Windows 原生客户端及轻巧、跟手的交互价值。
2. 实际用起来是什么样？用直接展开的真实截图与自动循环演示展示，不制作虚构产品界面。
3. 为什么值得换一个界面？解释 GPUI 原生渲染与长对话虚拟化，用具体交互展示轻快，不用内存数字作宣传。
4. 原有配置是否能继续用，数据在哪？说明共享 OpenCode 配置、本地保存与模型供应商请求边界。
5. 如何开始？提供真实的 Windows 构建下载、架构选择、环境前提及常见问题。

## 同类网页

| 页面 | 观察到的表达方式 | 可借鉴的原则 | Fintwind 的选择 |
| --- | --- | --- | --- |
| [T3 Code](https://t3.codes) | “control plane for coding agents”；居中首屏、大幅应用截图、多个 harness 标识，后续用用户评价和开源说明建立信任。源码中包含暗色网格及漂浮图标。 | 产品实拍优先；明确沿用用户已有服务。 | 聚焦本机 OpenCode，不暗示支持多个独立 agent 后端。用原生实现和实拍证据建立信任。 |
| [Conductor](https://www.conductor.build) | 本轮文案复查的主标题为 “Run a team of coding agents in the cloud.”，后续分别介绍隔离环境、已有订阅与跨设备工作。 | 先说清工作方式，各节讲一个具体能力。 | 明确本机 Windows 定位，按会话、模型、MCP 与用量组织信息。 |
| [Zed](https://zed.dev) | 主张速度、协作与 agent；解释 Rust 与 GPU，提供功能演示、源码入口。 | 将技术选择转译为可感知体验，并给出可查证实现。 | 解释长对话可见行渲染，避免数字化性能宣传。 |
| [OpenCode](https://opencode.ai) | 官方页面使用 `<video autoplay playsinline loop muted preload="auto" poster="…">`，没有 `controls`。 | 让实机操作自行演示，省去进入播放器的步骤。 | 静音循环、内联播放、无控制条；压缩视频，离屏暂停并尊重减弱动态效果。 |

## 本应用证据

| 主张 | 证据 |
| --- | --- |
| Windows 原生 Rust + GPUI，独立 daemon | `README.zh-CN.md:5-7,40-61,79-89`、`Cargo.toml` |
| 长会话按可见内容渲染 | `src/app/transcript_view.rs:349,502-531`，`docs/performance.md` |
| OpenCode 配置共用 | `src/app/providers_page.rs:1-13`、`src/app/mcp_page.rs:1-13` |
| 多会话、模型切换、MCP、用量统计 | `page/会话页.png`、`标签页.png`、`模型选择.png`、`供应商.png`、`MCP.png`、`用量.png` |
| 本地优先、默认零遥测、无独立账号 | `README.zh-CN.md:48-51`；模型请求仍发往配置的供应商 |
| 免费开源，源于 waku | `LICENSE`、`README.zh-CN.md:70-77` |
| 可下载版本 | GitHub Releases API 当日返回 v0.2.1，含 x86_64 / aarch64 的 Setup.exe 与便携 ZIP；与本仓库版本一致。 |

按用户反馈，页面移除了内存快照、具体内存数字与相关说明。两张 `Snipaste_*.png` 是旧网页截图，仅作为上下文，不当作本应用界面，也不沿用图中未重新核实的安装命令。

发布口径：v0.2.1 对应 `bb81e0a`，多会话标签页在后续的 `36f4b9c` 新增。因此首屏实拍、功能展台与视频均明确标注开发版，并说明标签页尚未包含在 v0.2.1 下载中。

## 本轮文案重写

重新读取 OpenCode、T3 Code、Conductor 和 Zed 官网的标题及介绍，借鉴信息组织方式，用本项目的实际能力重写中文文案：

| 参考表达 | 采用的写法 | 页面中的应用 |
| --- | --- | --- |
| OpenCode：“The open source AI coding agent” | 首屏直接说明产品身份与使用环境。 | “OpenCode，原生桌面体验。”配合 Windows、免费开源与本机服务说明。 |
| T3 Code：“Bring your own sub” | 直说已有订阅、Key 和配置可以继续使用。 | 供应商、模型服务与共享 OpenCode 配置的说明。 |
| Conductor：“Bring your own subscriptions and keys.” | 一个标题只表达一个可理解的能力。 | “为任务选择合适的模型”“给 Agent 接上常用工具”“Token 和费用，一处看清”。 |
| Zed：“Written from scratch in Rust to efficiently leverage multiple CPU cores and your GPU.” | 技术选型紧接具体使用体验。 | 以“长对话，也能轻快滚动”解释 GPUI 与可见内容渲染。 |

删除泛化的“心流”“主场”等口号。导航、按钮、错误、FAQ、SEO 元信息与页脚统一使用直接、具体的表达；不借用同行的用户规模、云端运行或多后端能力。

## 设计读法

面向 Windows / OpenCode 开发者的中文产品落地页，采用清爽、克制的原生工具气质。核心定位为「OpenCode，原生桌面体验」。

- `DESIGN_VARIANCE: 7`：不对称视频首屏、完整会话展示、不等宽的截图组和实拍细节。
- `MOTION_INTENSITY: 4`：实机视频自动循环，辅以轻量进入与控件反馈；不接管滚动。
- `VISUAL_DENSITY: 3`：一节一个决策，长说明收进 FAQ，CTA 用语统一。
- 配色：按用户要求固定白色主题，移除深色主题与切换按钮；品牌绿仅用于文字、链接和主要操作。
- 字体：自托管 Manrope 可变字体用于拉丁文本；中文使用系统 UI 字体，避免额外下载大型中文字体。
- 图片：全部使用真实素材，按原始宽高比呈现；截图直接展开，点击可看原图。视频源为 `page/会话演示.mp4`，展示区域与生成的会话视频同步宽高比。进入视口后静音自动播放，离开视口暂停，减弱动态效果显示真实封面帧。
- 技术：Astro 构建静态 HTML，原生 CSS 与少量 TypeScript；无 React 客户端运行时、无跟踪脚本或远程字体请求。
- 交互：截图链接渐进增强为原生 dialog，支持键盘与焦点返回；原生 details、真实架构下载链接；演示为非交互媒体，不响应点击、触摸或快捷键暂停，无播放器控制条。

## 校验与产物

`bun run check` 检查 Astro / TypeScript；`bun run test:e2e` 验证桌面和移动端的截图、键盘操作、视频自动播放与暂停、下载架构、白色主题及无障碍；`bun run audit` 生成 Lighthouse 性能与无障碍报告。E2E 不做截图或视觉基线比较。

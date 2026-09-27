# 落地页验收记录

日期：2026-09-27。验证对象为文案重写、替换会话演示并移除点击暂停行为后的 `website/dist/` 静态构建。

## 检查结果

| 项目 | 结果 |
| --- | --- |
| `bun run build` | 成功生成静态页面及本地资源 |
| `bun run check` | 0 errors / 0 warnings / 0 hints |
| Playwright 桌面与移动端 E2E | 14 / 14 通过 |
| axe WCAG 2 A / AA、2.1 AA | 白色主题无违规项 |
| Lighthouse 移动端 Performance | 99 |
| Lighthouse Accessibility | 100 |
| Lighthouse Best Practices | 100 |
| Lighthouse SEO | 100 |
| LCP / CLS / Total Blocking Time | 1.8 s / 0 / 60 ms |

Lighthouse 使用本机静态 HTTP 服务和默认移动端模拟，属于实验室结果，不代表正式部署后的真实用户指标。未进行截图或视觉基线测试。

## 可重复验证的行为

- 会话、模型、供应商、MCP、用量与标签页截图直接展开，不需要切换标签页。
- 截图链接可用 Enter 打开原图弹窗，Escape 关闭后焦点回到原链接。
- 完整 Chromium 验证内联视频确实开始播放、播放时间推进；静音、循环、行内播放且无浏览器控制条。
- 演示已换成 `page/会话演示.mp4` 生成的 `session-demo.mp4` 与新封面；输出视频为 1440 × 856、无音轨，E2E 核实加载地址和实际解码尺寸。
- 鼠标点击、双击与移动端触摸后视频继续播放，播放时间仍推进；离开视口暂停，返回视口后继续。
- 减弱动态效果模式下显示静帧且不请求视频；动态恢复正常动效后自动播放，再开启减弱动态效果时停止。
- 切换 ARM64 后，安装包与便携 ZIP 链接均切换到实际存在的 v0.2.1 构建。
- 浏览器无 `change` 事件恢复架构选择时，初始化与 `pageshow` 均会同步安装包和便携版链接。E2E 使用浏览器内的属性恢复模拟覆盖两种时机。
- 系统深色外观及旧的深色主题偏好不会覆盖新的白色主题。
- 各功能图可加载；站内锚点存在；浏览器无未捕获错误。
- 禁用 JavaScript 后，截图仍完整展开且有原图链接，演示有 MP4 直链，ARM64 安装与便携包均有明确直链。

## 历史代码审查

前轮已完成开发版实拍说明、无 JavaScript 降级及架构恢复下载链接的审查修正。本轮按用户要求跳过代码审查，完成构建、类型检查和功能验证。

## 本机完整报告

- `playwright-report/index.html`
- `reports/e2e.json`
- `reports/lighthouse.html`
- `reports/lighthouse.json`

报告目录被 Git 忽略，可通过 `bun run test:e2e` 与 `bun run audit` 重建。

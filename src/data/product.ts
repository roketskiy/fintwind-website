export const repository = 'https://github.com/roketskiy/fintwind';
export const version = '0.2.1';
export const release = `${repository}/releases/tag/v${version}`;
export const downloadRoot = `${repository}/releases/download/v${version}`;

export const gallery = [
  {
    id: 'conversation', label: '多会话', image: 'conversation', width: 925, height: 885,
    title: '切换任务，\n接着上次的对话。',
    description: '用标签页管理不同会话。查看模型回复与工具执行，在任务进行时排队或插话。',
    details: ['会话标签页', '流式回复', '工具执行记录'],
    alt: 'Fintwind 多标签会话界面，展示代码验证、提交结果和输入栏',
  },
  {
    id: 'models', label: '模型选择', image: 'models', width: 717, height: 568,
    title: '为任务选择合适的模型。',
    description: '搜索和收藏常用模型，在输入栏切换模型、思考程度与访问模式。',
    details: ['模型搜索与收藏', '思考程度', '访问模式'],
    alt: 'Fintwind 模型选择器，展示搜索、收藏与思考程度设置',
  },
  {
    id: 'providers', label: '供应商', image: 'providers', width: 911, height: 881,
    title: '接入你已在用的模型服务。',
    description: '读取 OpenCode 的供应商配置，支持自定义端点和模型。沿用自己的订阅或 API Key。',
    details: ['已有 API Key', '自定义供应商', '共享 OpenCode 配置'],
    alt: 'Fintwind 供应商设置，展示 OpenCode 与自定义供应商的模型列表',
  },
  {
    id: 'mcp', label: 'MCP 工具', image: 'mcp', width: 908, height: 883,
    title: '给 Agent 接上常用工具。',
    description: '添加本地或远程 MCP 服务器，查看连接状态、调整配置，直接启用或停用。',
    details: ['本地与远程服务', '连接状态', 'OAuth 登录'],
    alt: 'Fintwind MCP 设置，展示本地和远程服务器、启停开关及命令配置',
  },
  {
    id: 'usage', label: '用量统计', image: 'usage', width: 910, height: 885,
    title: 'Token 和费用，一处看清。',
    description: '从本机会话统计 Token 与费用，用活动热力图、每日趋势和模型排名回看用量。',
    details: ['本地会话统计', '活动热力图', '模型用量排名'],
    alt: 'Fintwind 用量统计，展示 Token、会话数、费用、活动热力图和每日趋势',
  },
];

export const questions = [
  {
    title: '需要先安装 OpenCode 吗？',
    answer: '需要。Fintwind 使用本机 OpenCode 服务，请先安装并登录 OpenCode CLI。各版本支持的 OpenCode 范围可能不同，以对应 release 的版本说明为准。',
  },
  {
    title: '支持哪些 Windows 设备？',
    answer: '支持 Windows 10 1809 及更新版本、Windows 11，提供 x64 和 ARM64 版本。安装不需要管理员权限。使用便携版时，将 fintwind.exe 和 fintwind-daemon.exe 保留在同一目录即可。',
  },
  {
    title: 'Fintwind 收费吗？',
    answer: 'Fintwind 免费开源。使用模型产生的费用由对应供应商收取，沿用已有订阅或 API Key。',
  },
  {
    title: '对话会上传到 Fintwind 吗？',
    answer: 'Fintwind 不提供云端同步，对话记录和附件保存在本机。调用模型时，相关内容会发送至你配置的模型供应商。',
  },
  {
    title: 'Fintwind 和 OpenCode 是什么关系？',
    answer: 'Fintwind 是独立开发的 Windows 桌面客户端，基于 EGOIST 的 waku 项目构建，连接本机 OpenCode 服务。它不是 OpenCode 官方客户端。',
  },
];

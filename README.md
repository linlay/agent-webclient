# AGENT Webclient

AGENT 协议调试前端，基于 `React 18 + TypeScript + Webpack 5`。

当前版本支持：
- SSE 流式对话与历史回放
- Chat / Worker 两种会话模式
- Team 与 Agent 选择、`@智能体` 路由
- `interrupt` / `steer` 控制
- Frontend Tool 叠层（含 viewport / fireworks 等）
- TTS Voice 运行时与调试
- 可切换布局与右侧 Debug 面板

## 技术栈
- `react` / `react-dom`
- `typescript`
- `webpack` / `webpack-dev-server`
- `@ant-design/x-markdown` + `katex`（Markdown 与数学公式）
- `antd`

## 快速启动

### 1. 环境要求
- Node.js 18+
- 可访问 AGENT 后端 API

### 2. 安装依赖
```bash
npm install
```

### 3. 使用 `.env.example`
先复制示例配置，再按本地环境修改：
```bash
cp .env.example .env.development
```

示例（`.env.development`）：
```bash
PORT=11948
BASE_URL='http://127.0.0.1:11949'
NODE_ENV='development'
```

说明：
- `npm start` 会读取 `.env.development`
- `PORT` 控制前端开发端口
- `BASE_URL` 用于前端请求后端 API（如需）

### 4. 本地开发
```bash
npm start
```
- 默认地址：`http://localhost:11948`
- dev server 会代理 `/api/ap/*` 到 `webpack.config.js` 中的 `devServer.proxy.target`

### 5. 生产构建
```bash
npm run build
```

### 6. 测试
```bash
npm test
```

### 7. Bash 脚本示例

开发环境一键启动示例：
```bash
#!/usr/bin/env bash
set -euo pipefail

cp -n .env.example .env.development || true
npm install
npm start
```

生成发布包（使用仓库内 `package.sh`）：
```bash
#!/usr/bin/env bash
set -euo pipefail

chmod +x ./package.sh
./package.sh
```

发布目录部署示例（`release/`）：
```bash
#!/usr/bin/env bash
set -euo pipefail

cd release
cp -n .env.example .env || true
docker compose up -d --build
```

## 架构总览

### 目录结构
```text
src/
  components/
    layout/            # App 壳、TopNav、BottomDock
    sidebar/           # 左侧会话、右侧调试、Worker 浮层
    composer/          # 输入区、@mention、interrupt/steer、语音听写
    timeline/          # 消息时间线、thinking/tool/content 渲染
    modal/             # 设置、事件 popover、action modal
    frontend-tool/     # 前端工具容器
    effects/           # fireworks 等视觉特效
    common/            # 通用组件（如 MaterialIcon）
  context/
    AppContext.tsx     # 全局状态 + reducer
    types.ts           # 领域模型与状态类型
    constants.ts       # 常量与断点
  hooks/
    useChatActions.ts       # agents/teams/chats 加载与历史回放
    useMessageActions.ts    # query 发送与 SSE 消费
    useAgentEventHandler.ts # 流式事件 -> timeline 状态机
    useActionRuntime.ts     # 动作运行时桥接
    useVoiceRuntime.ts      # TTS voice runtime 注入与生命周期
  lib/
    apiClient.ts            # API 封装
    sseParser.ts            # SSE 解析
    contentSegments.ts      # content 分段（viewport/tts-voice）
    mention*.ts             # mention 解析与候选
    worker*.ts              # worker 列表与关联会话格式化
```

### 核心状态
全局状态集中在 `AppContext`，主要包括：
- 会话域：`chatId`、`runId`、`streaming`、`abortController`
- 时间线域：`timelineNodes`、`timelineOrder`、`contentNodeById`、`reasoningNodeById`
- Worker/Team 域：`conversationMode`、`workerRows`、`workerSelectionKey`、`workerRelatedChats`
- UI 域：`layoutMode`、`leftDrawerOpen`、`rightDrawerOpen`、`desktopDebugSidebarEnabled`
- 交互域：`planningMode`、`steerDraft`、`mentionSuggestions`
- 调试域：`events`、`debugLines`、`toolStates`

### 数据流
1. `ComposerArea` 触发 `agent:send-message`
2. `useMessageActions` 调用 `/api/ap/query`（SSE）
3. `consumeJsonSseStream` 持续解析事件
4. `useAgentEventHandler` 将 `run.* / content.* / reasoning.* / tool.*` 映射到 timeline
5. `ConversationStage` / `TimelineRow` 渲染最终 UI

### 关键特性映射
- 会话历史回放：`useChatActions.loadChat`（事件重放为 `BATCH_UPDATE`）
- 中断与引导：`interruptChat` / `steerChat`
- `@智能体`：输入展示名称，调用 query 时传 key
- Worker 模式：按员工/小组聚合历史会话，右侧悬浮列表联动
- 数学公式：`MarkdownContent` + `katex`
- 语音：
  - 输入听写：浏览器 `SpeechRecognition`
  - 输出播放：`voiceRuntime` WebSocket（`/api/ap/ws/voice`）

## API 概览
`src/lib/apiClient.ts` 中封装了主要接口：
- `GET /api/ap/agents`
- `GET /api/ap/teams`
- `GET /api/ap/chats`
- `GET /api/ap/chat`
- `POST /api/ap/query`（SSE）
- `POST /api/ap/interrupt`
- `POST /api/ap/steer`
- `POST /api/ap/submit`
- `GET /api/ap/viewport`

## 配置说明

### 环境变量
- `PORT`：webpack dev server 端口（默认 `11948`）

### 代理
在 `webpack.config.js` 的 `devServer.proxy` 中修改后端目标地址。

## 文档
更多资料见 `.doc/`：
- `./.doc/GUIDE.md`
- `./.doc/api/SPEC.md`
- `./.doc/architecture/SYSTEM.md`

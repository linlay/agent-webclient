# CLAUDE.md

## 1. 项目概览
`agent-webclient` 是 AGENT 协议调试前端，用于消费后端 `/api/*`、`/ws` 和 `/api/voice/*` 能力并展示会话、事件流、工具执行和调试信息。它不是业务官网或通用后台，而是面向协议联调、运行观察和前端交互验证的专用客户端。

## 2. 技术栈
- 语言：TypeScript
- 框架：React 18
- 构建：Webpack 5、webpack-dev-server
- 样式：CSS、PostCSS、CSS Modules
- UI：Ant Design、`@ant-design/x`、`@ant-design/x-markdown`
- 数学公式：KaTeX
- 测试：Jest、ts-jest
- 部署：Docker、Nginx 静态站点代理
- Program Bundle 后端：Node.js 18+、Express、http-proxy-middleware

## 3. 架构设计
应用采用单页前端结构，`src/App.tsx` 负责装配整体布局与上下文。全局状态由 `src/context/AppContext.tsx` 统一管理，消息输入、流式事件消费、语音播放、计划面板、前端工具渲染等能力拆分在 hooks 和 lib 层。

核心调用链如下：
- 用户在 Composer 区输入消息
- `useMessageActions` 发起 `/api/query` 请求，按运行模式消费 SSE 或 WebSocket 返回
- `sseParser`、`queryStreamRuntime.ws` 与 `useAgentEventHandler` 将流式事件归并为时间线节点和运行时状态
- Timeline、Sidebar、Plan Panel、Frontend Tool 容器根据状态树渲染
- `voiceRuntime`、`useVoiceChatRuntime` 与 `/api/voice/ws` 负责 TTS / 语音聊天链路

## 4. 目录结构
- `public/`：HTML 模板等静态入口资源
- `src/components/`：布局、消息时间线、输入区、侧边栏、模态框、计划面板、前端工具与通用 UI 组件
- `src/context/`：应用状态、常量、事件类型与全局类型定义
- `src/hooks/`：消息发送、事件处理、动作运行时、语音运行时、Worker 数据同步等逻辑
- `src/lib/`：API 客户端、SSE / WebSocket 解析、附件处理、worker / timeline 格式化、语音与协议辅助逻辑
- `src/styles/`：全局样式与设计令牌
- `backend/`：Program Bundle 使用的轻量 Express 代理服务与测试
- `scripts/`：镜像、程序包与发布辅助脚本
- `nginx.conf`：容器内反向代理模板
- `Makefile`：本地开发、测试、构建与容器命令入口
- `webpack.config.js` / `tsconfig.json`：当前 TypeScript + Webpack 构建链必需配置

## 5. 数据结构
主要数据结构集中在 [`src/context/types.ts`](./src/context/types.ts)：
- `AgentEvent`：后端流式事件的统一前端表示
- `TimelineNode`：消息、thinking、tool、content 等时间线节点
- `ToolState` / `ActionState`：工具与动作执行态
- `PlanItem` / `PlanRuntime`：规划模式下的计划状态
- `Agent`、`Team`、`Chat`、`WorkerRow`：会话、团队与 worker 选择器相关实体

这些结构服务于事件回放、实时流式更新、工具渲染、语音联动和调试面板展示。

## 6. API 定义
接口消费封装位于 [`src/lib/apiClient.ts`](./src/lib/apiClient.ts)，当前使用的主要接口包括：
- `GET /api/agents`
- `GET /api/teams`
- `GET /api/agent`
- `GET /api/skills`
- `GET /api/tool`
- `GET /api/tools`
- `GET /api/chats`
- `GET /api/chat`
- `GET /api/viewport`
- `GET /api/data`
- `POST /api/query`：对话流入口
- `POST /api/submit`
- `POST /api/interrupt`
- `POST /api/steer`
- `GET /api/voice/ws`：语音 / TTS WebSocket
- `GET /ws`：部分实时流式能力的 WebSocket 通道

接口统一按 `ApiResponse` 结构读取，错误会被包装为 `ApiError`。

## 7. 开发要点
- 环境变量以根目录 [`.env.example`](./.env.example) 为契约来源，开发与部署都使用 `.env`。
- 本地开发代理依赖 `webpack.config.js` 中的 `devServer.proxy`，普通 API 代理目标由 `BASE_URL` 控制，`/ws` 代理到 `BASE_URL`，语音 WebSocket 与语音相关 HTTP 代理到 `VOICE_BASE_URL`。
- Program Bundle 运行时会启动 [`backend/server.js`](./backend/server.js)，由 Express 负责静态文件托管、SPA fallback、`/api/*` / `/api/voice/*` / `/ws` 代理。
- 生产容器通过根目录 `nginx.conf` 模板反向代理普通 `/api/*` 与 `/ws` 到对应上游，并将 `/api/voice/ws`、`/api/voice/*` 单独反向代理到 `VOICE_BASE_URL`。
- SSE 和 WebSocket 请求都需要禁用代理缓冲，避免事件流被延迟或截断。
- 语音能力依赖浏览器 `SpeechRecognition` / `webkitSpeechRecognition`、音频采集能力与后端 WebSocket 能力，浏览器兼容性需单独验证。
- 当前仓库存在根目录 `package-lock.json`；常规本地安装走 `make install`，会同时安装前端依赖和 `backend/package.json` 中的 Program Bundle 运行时依赖。

## 8. 开发流程
本地开发流程：
1. `cp .env.example .env`
2. 在 `.env` 中设置可访问的 `BASE_URL` 与 `VOICE_BASE_URL`
3. `make install`
4. `make dev`
5. `make test`
6. `make build`

容器联调流程：
1. 在 `.env` 中设置可访问的 `BASE_URL` 与 `VOICE_BASE_URL`
2. 执行 `make docker-up`
3. 通过 `docker compose -f compose.yml logs -f webclient` 检查容器与代理状态
4. 需要重建镜像时执行 `make docker-build`
5. 停止容器时执行 `make docker-down`

## 9. 已知约束与注意事项
- 本仓库是后端协议的消费方，不在前端定义或修改后端协议语义。
- 开发与部署都依赖外部 AGENT API / 语音服务，脱离后端无法完成核心联调。
- 若上游返回非标准 JSON、SSE 帧格式异常或 WebSocket 事件不完整，前端会以错误态显示，但无法替代后端修复协议问题。
- 语音、前端工具和运行态调试能力对浏览器能力、代理配置和后端实时链路较敏感，回归时需要重点验证。

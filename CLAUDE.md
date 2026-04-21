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
应用采用单页前端结构，`src/app/App.tsx` 负责装配 Ant Design 主题与应用上下文，`src/app/index.tsx` 负责入口挂载与全局样式引入。全局状态由 `src/app/state/AppContext.tsx` 统一导出，状态初始化、reducer、provider 和类型定义拆分在 `src/app/state/` 下；消息输入、流式事件消费、语音播放、计划面板、前端工具渲染等能力继续按 `features/*/{components,hooks,lib}` 组织。

核心调用链如下：
- 用户在 Composer 区输入消息
- `src/features/composer/hooks/useMessageActions.ts` 发起 `/api/query` 请求，按运行模式消费 SSE 或 WebSocket 返回
- `src/features/transport/lib/queryStreamRuntime.sse.ts`、`src/features/transport/lib/queryStreamRuntime.ws.ts` 与 `src/features/timeline/hooks/useAgentEventHandler.ts` 将流式事件归并为时间线节点和运行时状态
- `src/features/timeline/components/*`、`src/app/layout/*`、`src/features/plan/components/PlanPanel.tsx`、`src/features/tools/components/FrontendToolContainer.tsx` 根据状态树渲染
- `src/features/voice/lib/voiceRuntime.ts`、`src/features/voice/hooks/useVoiceChatRuntime.ts` 与 `/api/voice/ws` 负责 TTS / 语音聊天链路

## 4. 目录结构
- `public/`：HTML 模板等静态入口资源
- `src/app/`：应用壳层，包含入口装配、布局、模态框、effects 与 `state/`
- `src/features/`：按业务域拆分的功能模块；每个域按 `components/`、`hooks/`、`lib/` 分层
- `src/shared/api/`：跨功能复用的 API 客户端与鉴权封装
- `src/shared/styles/`：全局主题变量、样式入口与主题工具；当前统一入口为 `globals.css`
- `src/shared/ui/`：通用基础 UI 组件
- `src/shared/utils/`：通用工具函数
- `backend/`：Program Bundle 使用的轻量 Express 代理服务与测试
- `scripts/`：镜像、程序包与发布辅助脚本
- `nginx.conf`：容器内反向代理模板
- `Makefile`：本地开发、测试、构建与容器命令入口
- `webpack.config.js` / `tsconfig.json`：当前 TypeScript + Webpack 构建链必需配置

## 5. 数据结构
主要数据结构集中在 [`src/app/state/types.ts`](./src/app/state/types.ts)：
- `AgentEvent`：后端流式事件的统一前端表示
- `TimelineNode`：消息、thinking、tool、content 等时间线节点
- `ToolState` / `ActionState`：工具与动作执行态
- `PlanItem` / `PlanRuntime`：规划模式下的计划状态
- `Agent`、`Team`、`Chat`、`WorkerRow`：会话、团队与 worker 选择器相关实体

这些结构服务于事件回放、实时流式更新、工具渲染、语音联动和调试面板展示。

## 6. API 定义
接口消费封装位于 [`src/shared/api/apiClient.ts`](./src/shared/api/apiClient.ts)，当前使用的主要接口包括：
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
- 仓库统一使用 `npm`；前端根目录与 `backend/` 都提交 `package-lock.json`，不使用 `pnpm` / `yarn` 锁文件。
- 本地开发代理依赖 `webpack.config.js` 中的 `devServer.proxy`，普通 API 代理目标由 `BASE_URL` 控制，`/ws` 代理到 `BASE_URL`，语音 WebSocket 与语音相关 HTTP 代理到 `VOICE_BASE_URL`。
- Program Bundle 运行时会启动 [`backend/server.js`](./backend/server.js)，由 Express 负责静态文件托管、SPA fallback、`/api/*` / `/api/voice/*` / `/ws` 代理。
- 生产容器通过根目录 `nginx.conf` 模板反向代理普通 `/api/*` 与 `/ws` 到对应上游，并将 `/api/voice/ws`、`/api/voice/*` 单独反向代理到 `VOICE_BASE_URL`。
- SSE 和 WebSocket 请求都需要禁用代理缓冲，避免事件流被延迟或截断。
- 语音能力依赖浏览器 `SpeechRecognition` / `webkitSpeechRecognition`、音频采集能力与后端 WebSocket 能力，浏览器兼容性需单独验证。
- `src/app/index.tsx` 只引入 `src/shared/styles/globals.css` 作为全局样式入口；旧的并行样式入口不再保留。

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

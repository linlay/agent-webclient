# CLAUDE.md

## 1. 项目概览
`agent-webclient` 是 AGENT 协议调试前端，用于消费后端 `/api/ap/*` 接口并展示会话、事件流、工具执行和调试信息。它不是业务官网或通用后台，而是面向协议联调、运行观察和前端交互验证的专用客户端。

## 2. 技术栈
- 语言：TypeScript
- 框架：React 18
- 构建：Webpack 5、webpack-dev-server
- 样式：CSS、PostCSS
- UI：Ant Design、`@ant-design/x`、`@ant-design/x-markdown`
- 数学公式：KaTeX
- 测试：Jest、ts-jest
- 部署：Docker、Nginx 静态站点代理

## 3. 架构设计
应用采用单页前端结构，`src/App.tsx` 负责装配整体布局与上下文。全局状态由 `src/context/AppContext.tsx` 统一管理，输入、流式事件消费、语音播放、前端工具渲染等能力拆分在 hooks 和 lib 层。

核心调用链如下：
- 用户在 Composer 区输入消息
- `useMessageActions` 发起 `/api/ap/query` SSE 请求
- `sseParser` 和 `useAgentEventHandler` 将流式事件归并为时间线节点
- Timeline、Sidebar、Plan Panel、Frontend Tool 容器根据状态树渲染
- `voiceRuntime` 与 `/api/ap/ws/voice` 负责 TTS 音频播放链路

## 4. 目录结构
- `public/`：HTML 模板等静态入口资源
- `src/components/`：布局、消息时间线、输入区、侧边栏、模态框、前端工具与通用 UI 组件
- `src/context/`：应用状态、常量与类型定义
- `src/hooks/`：消息发送、事件处理、聊天加载、动作运行时、语音运行时等逻辑
- `src/lib/`：API 客户端、SSE 解析、mention 解析、worker 格式化、viewport 与语音辅助逻辑
- `src/styles/`：全局样式与设计令牌
- `nginx.conf`：容器内反向代理模板
- `Makefile`：本地开发、测试与容器命令入口
- `webpack.config.js` / `tsconfig.json`：当前 TypeScript + Webpack 构建链必需配置

## 5. 数据结构
主要数据结构集中在 [`src/context/types.ts`](./src/context/types.ts)：
- `AgentEvent`：后端流式事件的统一前端表示
- `TimelineNode`：消息、thinking、tool、content 四类时间线节点
- `ToolState` / `ActionState`：工具与动作执行态
- `PlanItem` / `PlanRuntime`：规划模式下的计划状态
- `Agent`、`Team`、`Chat`、`WorkerRow`：会话与选择器相关实体

这些结构服务于事件回放、实时流式更新、工具渲染和调试面板展示。

## 6. API 定义
接口消费封装位于 [`src/lib/apiClient.ts`](./src/lib/apiClient.ts)，当前使用的主要接口包括：
- `GET /api/ap/agents`
- `GET /api/ap/teams`
- `GET /api/ap/agent`
- `GET /api/ap/skills`
- `GET /api/ap/skill`
- `GET /api/ap/tools`
- `GET /api/ap/tool`
- `GET /api/ap/chats`
- `GET /api/ap/chat`
- `GET /api/ap/viewport`
- `POST /api/ap/query`：SSE 对话流
- `POST /api/ap/submit`
- `POST /api/ap/interrupt`
- `POST /api/ap/steer`
- `GET /api/ap/data`
- `GET /api/ap/ws/voice`：TTS WebSocket

接口统一按 `ApiResponse` 结构读取，错误会被包装为 `ApiError`。

## 7. 开发要点
- 环境变量以根目录 [`.env.example`](./.env.example) 为契约来源，开发与部署都使用 `.env`。
- 本地开发代理依赖 `webpack.config.js` 中的 `devServer.proxy`，代理目标由 `BASE_URL` 控制。
- 生产容器通过根目录 `nginx.conf` 模板反向代理 `/api/ap/*`，启动时注入 `BASE_URL`。
- SSE 请求需要禁用代理缓冲，避免事件流被延迟或截断。
- 语音能力依赖浏览器 `SpeechRecognition` / `webkitSpeechRecognition` 与后端 WebSocket 能力，浏览器兼容性需单独验证。
- `package-lock.json` 已移除，Docker 与本地安装统一走非锁定依赖解析。

## 8. 开发流程
本地开发流程：
1. `cp .env.example .env`
2. `make install`
3. `make dev`
4. `make test`
5. `make build`

容器联调流程：
1. 在 `.env` 中设置可访问的 `BASE_URL`
2. 执行 `make docker-up`
3. 通过 `docker compose logs -f webclient` 检查容器与代理状态
4. 需要重建镜像时执行 `make docker-build`

## 9. 已知约束与注意事项
- 本仓库是后端协议的消费方，不在前端定义或修改后端协议语义。
- 开发与部署都依赖外部 AGENT API，脱离后端无法完成核心联调。
- 若上游返回非标准 JSON 或 SSE 帧格式异常，前端会以错误态显示，但无法替代后端修复协议问题。
- 语音与前端工具能力对浏览器能力、代理配置和后端实时链路较敏感，回归时需要重点验证。

# AGW Web Client

AGW Web Client 是 AGW / AGENT 协议的 Web 客户端。它消费上游 `/api/*` 与 `/ws` 能力，把智能体后端输出的对话、事件流、计划、工具调用、人工确认、产物和用量数据整理成可直接使用的工作台。前端只消费和展示后端协议，不定义或修改后端语义。

![工作方式](docs/images/agw-webclient-flow.svg)

## 核心能力

- **对话工作台**：选 Agent、发消息、看执行、接管运行；Composer 支持发送、附件、运行参数、模型覆盖、访问级别、steer 和 interrupt。

  ![](docs/images/screenshots/main-workspace.png)

- **运行可观测**：消息、推理、规划、工具、来源、产物、等待输入和错误进入统一时间轴；结构化计划进入计划面板，展示状态、进度、耗时和任务关联内容。

  ![](docs/images/screenshots/timeline-events.png) ![](docs/images/screenshots/plan-panel.png)

- **Usage 与预算**：`usage.snapshot` 展示输入 / 输出 / 推理 token、缓存命中、调用数、首字延迟、输出速度和预计费用；Agent 管理台维护 `budget` JSON。

  ![](docs/images/screenshots/usage-stats.png)

- **Debug 侧边栏**：按 run / request / content / reasoning / planning / plan / task / tool / awaiting / artifact / source / memory 等类型筛选，查看原始事件、归并状态和 transcript。

  ![](docs/images/screenshots/debug-sidebar.png)

- **人在回路（HITL）**：question / approval / form / plan 四类场景，用户提交后结果回写时间轴。

  ![](docs/images/screenshots/hitl-awaiting.png)

- **业务视图**：Viewport HTML 与 Frontend Tool iframe 容器负责加载、初始化、通信、提交和关闭；Artifact 面板支持图片、PDF、HTML、文本、音频、视频、Office 预览。

  ![](docs/images/screenshots/business-viewport.png)

- **侧边栏与管理**：左侧聚合 Agent、会话、pending awaiting、active run、未读状态；管理页提供 Agent 定义查看、创建、编辑、排序、诊断，以及 provider、model、MCP server、viewport server、tools 目录。

  ![](docs/images/screenshots/sidebar-management.png)

## 快速开始

前置：Node.js 18+、npm 9+、GNU Make、可访问的 AGW / AGENT API。容器部署另需 Docker Desktop 或 Docker Engine + Compose v2。

```bash
cp .env.example .env   # 至少确认 PORT 与 BASE_URL
make install
make dev                # http://localhost:11948
make test
make build              # 产物输出到 dist/
```

开发模式下 Webpack DevServer 把 `/api/*` 和 `/ws` 代理到 `BASE_URL`。

## 部署

### 容器部署（推荐）

```bash
cp .env.example .env   # 修改 BASE_URL，必要时修改 PORT
make docker-up         # 默认 http://localhost:11948
docker compose -f compose.yml logs -f webclient
make docker-down
```

容器内 Nginx 反向代理 `/api/*` 与 `/ws` 到 `BASE_URL`，并对流式接口关闭代理缓冲。

### 离线镜像包

在构建机执行：

```bash
make release-image                # 当前架构
ARCH=amd64 make release-image     # 指定架构
```

产物 `dist/release/agent-webclient-image-vX.Y.Z-linux-<arch>.tar.gz` 上传到目标服务器后解压，复制 `.env.example` 为 `.env`，再运行 `./start.sh` / `./stop.sh`。适合不能联网构建镜像的环境。

### 静态资源接入已有网关

`make build` 后将 `dist/` 部署到已有静态资源服务，自行配置 `/api/*` 与 `/ws` 反向代理到 `BASE_URL`、保留 WebSocket upgrade、对流式接口关闭 buffering、SPA fallback 到 `index.html`。无现成网关时优先用 Docker Compose。

## Desktop Program Bundle

```bash
make release            # 等价于 make release-program
```

产物 `dist/release/agent-webclient-vX.Y.Z-darwin-arm64.tar.gz` 或 `...-windows-amd64.zip`，包含 `manifest.json`、`.env.example`、`frontend/dist/` 和 Desktop 启停脚本。HTTP 托管、静态资源服务和代理路由由 ZenMind Desktop main process 负责，不内置后端。

## 配置

环境变量契约以 [`.env.example`](./.env.example) 为准，开发、容器和 release 共用同一组。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 是 | 本地开发端口，Docker Compose 中也是宿主机暴露端口 |
| `BASE_URL` | 是 | AGW / AGENT 后端 HTTP API 与主 `/ws` 基地址 |
| `VOICE_BASE_URL` | 否 | 语音 HTTP 与 `/api/voice/ws` 上游；不设置时语音能力关闭 |
| `DESKTOP_APP` | 否 | Desktop 场景标记 |
| `DEBUG_PANEL_ENABLED` | 否 | 显示调试面板入口 |
| `SETTINGS_MENU_ENABLED` | 否 | 显示设置入口 |
| `MEMORY_ENABLED` | 否 | 显示 memory 相关入口 |

`.env` 是本地真实配置，不提交版本库。

## 上游 API

前端统一按 `ApiResponse` 结构读取，错误包装为前端错误态。

`GET /api/agents` · `GET /api/teams` · `GET /api/agent` · `GET /api/chats` · `GET /api/chat` · `POST /api/query` · `GET /api/attach` · `POST /api/submit` · `POST /api/interrupt` · `POST /api/steer` · `GET /api/viewport` · `GET /api/data` · `GET /api/admin/skills` · `GET /api/admin/tools` · `GET /ws` · `GET /api/voice/ws`

## 项目结构

```text
public/        HTML 模板等静态入口资源
docs/          中文专题文档与截图
src/app/       应用壳层、路由、布局、状态与页面入口
src/features/  对话、时间线、工具、计划、worker 等功能模块
src/shared/    data（API、鉴权、缓存）· styles · ui · utils
scripts/       发布、镜像与程序包辅助脚本
nginx.conf     容器内 Nginx 反向代理模板
compose.yml    Docker Compose 部署入口
```

## 深入文档

按模块阅读 [docs/](./docs/)：

- **01 应用基础**：[入口与布局](docs/01-应用基础-应用入口路由与布局壳层.md) · [全局状态](docs/02-应用基础-全局状态与Reducer.md) · [运行时配置](docs/03-应用基础-运行时配置与功能开关.md)
- **10 协议数据**：[事件结构与枚举](docs/10-协议数据-事件数据结构与协议枚举.md) · [API 与 DTO](docs/11-协议数据-API端点注册与DTO.md) · [请求路由与鉴权](docs/12-协议数据-请求路由缓存与鉴权错误.md) · [SSE 与 WebSocket](docs/13-协议数据-流式传输SSE与WebSocket.md)
- **20 会话输入**：[会话加载与 LiveSummary](docs/20-会话输入-会话加载回放与LiveSummary.md) · [Composer 与快捷交互](docs/21-会话输入-Composer输入与快捷交互.md) · [发送路由与运行控制](docs/22-会话输入-消息发送路由与运行控制.md) · [运行参数与访问级别](docs/23-会话输入-运行参数模型与访问级别.md) · [附件与引用](docs/24-会话输入-附件上传与引用.md)
- **30 运行时间线**：[事件处理与渲染](docs/30-运行时间线-时间线事件处理与渲染.md) · [Reasoning 与 Planning](docs/31-运行时间线-Reasoning与Planning节点.md) · [计划事件与任务视图](docs/32-运行时间线-计划事件与任务视图.md) · [Artifact 与资源预览](docs/33-运行时间线-Artifact发布与资源预览.md)
- **40 交互容器**：[Viewport](docs/40-交互容器-Viewport视图容器.md) · [FrontendTool](docs/41-交互容器-FrontendTool容器协议.md) · [HITL Awaiting](docs/42-交互容器-HITL-Awaiting协议与状态机.md) · [Question](docs/43-交互容器-HITL-Question问题交互.md) · [Approval](docs/44-交互容器-HITL-Approval审批交互.md) · [Form](docs/45-交互容器-HITL-Form表单HTML交互.md) · [Plan](docs/46-交互容器-HITL-Plan计划决策.md)
- **50 Worker 管理**：[Agent Team 与 Worker](docs/50-Worker管理-AgentTeam选择与Worker列表.md) · [Agent 管理台](docs/51-Worker管理-Agent管理台.md) · [Registry 与工具目录](docs/52-Worker管理-Registry管理台与工具目录.md)
- **60 页面能力**：[Memory](docs/60-页面能力-Memory页面.md) · [Archive](docs/61-页面能力-Archive归档页面.md) · [Automation](docs/62-页面能力-Automation页面.md)
- **70+ 周边与交付**：[语音 ASR/TTS](docs/70-语音能力-语音输入ASR与TTS.md) · [样式主题与国际化](docs/80-界面基础-样式主题基础UI与国际化.md) · [Desktop 宿主桥接](docs/81-宿主集成-Desktop宿主桥接.md) · [开发与生产代理](docs/90-交付运维-开发代理与生产反向代理.md) · [版本化打包与部署](docs/91-交付运维-版本化打包与部署.md) · [手工测试用例](docs/92-质量验证-手工测试用例.md)

## 常见问题

- **页面能打开但接口失败**：检查 `.env` 中 `BASE_URL` 是否可访问。容器内 `localhost` 指容器自身，需要改成宿主机地址、内网域名或 `host.docker.internal`。
- **实时输出变慢或一次性刷出**：代理 buffering 未关闭。对 `/api/*` 和 `/ws` 关闭 buffering 并提高 read timeout；容器内置 Nginx 已处理。
- **WebSocket 无法连接**：确认上游提供 `/ws`、反向代理保留 `Upgrade` 与 `Connection` 头；自定义网关需自行配置。

## 边界

本仓库只提供 Web 客户端，不包含智能体后端，不定义后端协议语义；模型、工具、权限、记忆、调度和资源存储以后端服务为事实源，脱离可访问的 AGW / AGENT API 无法完成核心联调。
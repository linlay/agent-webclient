# agent-webclient

## 1. 项目简介
`agent-webclient` 是一个 AGENT 协议调试前端，用于连接 `/api/*` 接口，支持流式对话、历史回放、Team/Agent 切换、前端工具展示、语音输入与 TTS 播放等调试能力。

当前仓库只提供 Web 客户端。发布链路分为两类：

- Program Bundle：ZenMind Desktop 内置服务包，包含静态资源和 manifest；HTTP 托管由 Desktop main process 负责
- Image Bundle：包含离线 Docker 镜像、compose 和运行脚本的镜像部署包

## 专题文档
项目细节拆分在 `docs/` 下，入口文档只保留快速开始、配置和部署说明。前端文档只说明如何消费、展示和联调后端 AGENT 协议，不在本仓库重新定义后端协议语义。

- [应用入口路由与布局壳层](docs/应用入口路由与布局壳层.md)
- [全局状态与Reducer](docs/全局状态与Reducer.md)
- [事件数据结构与协议枚举](docs/事件数据结构与协议枚举.md)
- [运行时配置与功能开关](docs/运行时配置与功能开关.md)
- [开发代理与生产反向代理](docs/开发代理与生产反向代理.md)
- [API端点注册与DTO](docs/API端点注册与DTO.md)
- [请求路由缓存与鉴权错误](docs/请求路由缓存与鉴权错误.md)
- [流式传输SSE与WebSocket](docs/流式传输SSE与WebSocket.md)
- [会话加载回放与LiveSummary](docs/会话加载回放与LiveSummary.md)
- [Composer输入与快捷交互](docs/Composer输入与快捷交互.md)
- [消息发送路由与运行控制](docs/消息发送路由与运行控制.md)
- [运行参数模型与访问级别](docs/运行参数模型与访问级别.md)
- [附件上传与引用](docs/附件上传与引用.md)
- [Artifact发布与资源预览](docs/Artifact发布与资源预览.md)
- [时间线事件处理与渲染](docs/时间线事件处理与渲染.md)
- [Reasoning与Planning节点](docs/Reasoning与Planning节点.md)
- [计划事件与任务视图](docs/计划事件与任务视图.md)
- [Viewport视图容器](docs/Viewport视图容器.md)
- [FrontendTool容器协议](docs/FrontendTool容器协议.md)
- [HITL-Awaiting协议与状态机](docs/HITL-Awaiting协议与状态机.md)
- [HITL-Question问题交互](docs/HITL-Question问题交互.md)
- [HITL-Approval审批交互](docs/HITL-Approval审批交互.md)
- [HITL-Form表单HTML交互](docs/HITL-Form表单HTML交互.md)
- [HITL-Plan计划决策](docs/HITL-Plan计划决策.md)
- [AgentTeam选择与Worker列表](docs/AgentTeam选择与Worker列表.md)
- [Agent管理台](docs/Agent管理台.md)
- [Registry管理台与工具目录](docs/Registry管理台与工具目录.md)
- [语音输入ASR与TTS](docs/语音输入ASR与TTS.md)
- [Memory归档与Automation页面](docs/Memory归档与Automation页面.md)
- [样式主题基础UI与国际化](docs/样式主题基础UI与国际化.md)
- [Desktop宿主桥接](docs/Desktop宿主桥接.md)
- [版本化打包与部署](docs/版本化打包与部署.md)
- [手工测试用例](docs/手工测试用例.md)

## 2. 快速开始
### 前置要求
- Node.js 18+
- npm 9+
- GNU Make
- Docker Desktop 或 Docker Engine + Compose v2（仅容器部署 / `make release-image` 需要）
- 可访问的 AGENT API 服务

### 初始化环境变量
```bash
cp .env.example .env
```

首次本地开发通常只需要确认以下字段：
- `PORT`：前端开发服务端口
- `BASE_URL`：runner HTTP API 与主 `/ws` 基地址
- `VOICE_BASE_URL`：可选的语音 HTTP / WebSocket 服务基地址；未设置时隐藏语音功能

### 安装依赖
```bash
make install
```

仓库统一使用 `npm` 作为包管理器，并提交根目录 `package-lock.json` 来固定前端构建依赖版本。

### 本地启动
```bash
make dev
```

默认访问地址为 [http://localhost:11948](http://localhost:11948)。开发模式下，Webpack Dev Server 会将普通 `/api/*` 和主 `/ws` 代理到 `BASE_URL`。设置 `VOICE_BASE_URL` 后，语音 HTTP 与 `/api/voice/ws` 会单独代理到该上游；未设置时语音功能隐藏且不注册语音代理。Webpack 自身的热更新 WebSocket 会使用内部路径 `/__webpack_hmr`，避免与业务 `/ws` 冲突。SSE 仅保留为手动兼容模式。

### 本地验证生产构建
```bash
make build
```

该命令会生成生产静态资源；Desktop Program Bundle 只打包 `frontend/dist/`，本地代理仍通过 `make dev` 验证。

### 测试
```bash
make test
```

### 生产构建
```bash
make build
```

### Program Bundle
```bash
make release
```

也可以显式执行：
```bash
make release-program
```

该命令会先生成生产环境 `dist/`，再输出由 ZenMind Desktop 托管的版本化压缩包：

- macOS：`dist/release/agent-webclient-vX.Y.Z-darwin-arm64.tar.gz`
- Windows：`dist/release/agent-webclient-vX.Y.Z-windows-amd64.zip`
- 解压目录：`agent-webclient/`

Program Bundle 约束：

- 包内包含 `manifest.json`、`.env.example`、`README.txt`、`frontend/dist/`
- manifest 设置 `frontend.hostManaged: true`，不包含 `backend.entry`，HTTP 托管由 ZenMind Desktop main process 负责
- Program Bundle 不要求包内或宿主机启动 Node.js 子进程，也不包含生命周期脚本
- 版本号来自根目录 [`VERSION`](./VERSION)，格式固定为 `vX.Y.Z`

## 3. 配置说明
- 环境变量契约以 [`.env.example`](./.env.example) 为准，本地通过 `cp .env.example .env` 初始化。
- `.env` 为本地真实配置，不提交版本库；仓库只追踪 `.env.example`。
- 当前仓库不使用额外的 `configs/*.yml`；配置优先级为“代码默认值 < 环境变量”。
- `BASE_URL` 与 `VOICE_BASE_URL` 都不在代码、脚本或容器编排里写死，统一从 `.env` 提供；`VOICE_BASE_URL` 可省略以关闭语音功能。
- 开发模式、容器部署和 release 构建复用同一组变量名，但各自的实际值应由当前环境决定。
- `PORT` 在本地开发时表示 dev server 端口，在 [`compose.yml`](./compose.yml) 中表示宿主机暴露端口。
- 容器代理配置位于根目录 [`nginx.conf`](./nginx.conf)，启动时通过 `envsubst` 注入 `BASE_URL` 与可选的语音代理片段。
- 发布版本号以根目录 [`VERSION`](./VERSION) 为唯一来源，正式版本格式固定为 `vX.Y.Z`。

## 4. 部署
### 容器构建
```bash
make docker-build
```

### 本地容器编排
```bash
cp .env.example .env
make docker-up
```

部署前至少检查：
- `.env` 中的 `BASE_URL` 已指向部署环境可访问的 runner HTTP API
- `.env` 中的 `BASE_URL` 对应上游实际提供 `/api/*` 与 `/ws`
- 如需语音功能，`.env` 中的 `VOICE_BASE_URL` 已指向可访问的语音 WebSocket / HTTP 上游
- `PORT` 未与宿主机其他服务冲突

### 停止容器
```bash
make docker-down
```

### Program Bundle 发布
```bash
make release
```

等价入口：
```bash
make release-program
```

发布规则：
- `make release` 与 `make release-program` 行为一致。
- 会读取根目录 `VERSION`，校验格式必须为 `vX.Y.Z`。
- 构建优先读取根目录本地 `.env`；如果缺失，会自动回退到 `.env.example`，并强制使用 production 模式完成前端打包。
- 默认产物为 `darwin/arm64` 和 `windows/amd64` 两个平台；也可以通过 `PROGRAM_TARGET_MATRIX=<os>/<arch>` 覆盖。
- 解压后根目录固定为 `agent-webclient/`，其下包含 `manifest.json`、`.env.example`、`README.txt`、`frontend/dist/`，不包含 Program backend。
- 打包完成后，工作区只保留 `dist/release/` 下的最终压缩包，不保留展开的 `dist/js`、`dist/css`、`dist/fonts`。

### Program Bundle 使用
Program Bundle 通常由 ZenMind Desktop 内置资源同步与服务管理器安装，并由 Desktop main process 绑定本地端口、托管静态资源和代理路由。

如需手动检查包结构，可以解压并检查关键文件：
```bash
tar -xzf dist/release/agent-webclient-vX.Y.Z-darwin-arm64.tar.gz
cd agent-webclient
ls manifest.json .env.example README.txt frontend/dist/index.html
```

Program Bundle 不提供手动启动入口；Desktop main process 负责本地 HTTP 托管、静态资源服务和代理路由。Desktop 端需要至少确认：
- `.env` 中的 `BASE_URL` 指向可访问的 AGENT HTTP API。
- `.env` 中的 `BASE_URL` 对应上游实际提供 `/api/*` 与 `/ws`。
- 如需语音功能，`.env` 中的 `VOICE_BASE_URL` 指向可访问的语音 WebSocket / HTTP 上游。
- `PORT` 未与 Desktop 内其他服务冲突，默认值为 `11948`。

### Image Bundle 发布
```bash
make release-image
```

也可以显式指定目标架构：
```bash
ARCH=amd64 make release-image
ARCH=arm64 make release-image
```

发布规则：
- 会读取根目录 `VERSION`，校验格式必须为 `vX.Y.Z`。
- 打包过程会在宿主机构建前端静态资源，再用 `docker buildx` 生成单架构运行镜像。
- release-image 构建优先读取根目录本地 `.env`；如果缺失，会自动回退到 `.env.example`，并强制使用 production 模式完成前端打包。
- 最终 bundle 输出到 `dist/release/agent-webclient-image-vX.Y.Z-linux-<arch>.tar.gz`。
- bundle 内包含 `images/agent-webclient.tar`、`compose.release.yml`、`.env.example`、`start.sh`、`stop.sh`、`README.txt`。
- 打包完成后，工作区同样只保留 `dist/release/` 下的最终压缩包。

### Image Bundle 部署
```bash
tar -xzf dist/release/agent-webclient-image-vX.Y.Z-linux-amd64.tar.gz
cd agent-webclient
cp .env.example .env
./start.sh
```

部署端需要至少确认：
- `.env` 中的 `BASE_URL` 指向可访问的 AGENT HTTP API。
- `.env` 中的 `BASE_URL` 对应上游实际提供 `/api/*` 与 `/ws`。
- 如需语音功能，`.env` 中的 `VOICE_BASE_URL` 指向可访问的语音 WebSocket / HTTP 上游。
- `.env` 中的 `HOST_PORT` 未与宿主机其他服务冲突，默认值为 `11948`。
- Linux Docker 环境下，bundle 自带的 `compose.release.yml` 已补齐 `host.docker.internal:host-gateway` 映射。

### 发布验证
建议按以下顺序验证：

1. `make release`
确认生成对应平台压缩包，manifest 包含 `frontend.hostManaged: true` 且不包含 `scripts` 字段，解压后包含 `manifest.json`、`.env.example`、`README.txt`、`frontend/dist/`，且不包含 `backend/`。

2. `make release-program`
确认行为与 `make release` 一致。

3. `make release-image`
确认生成 `dist/release/agent-webclient-image-vX.Y.Z-linux-<arch>.tar.gz`，包内包含镜像 tar、`compose.release.yml`、image bundle 专用 `.env.example`、`start.sh`、`stop.sh`。

4. `make test`
确认前端测试通过。

## 5. 运维
### 查看容器状态
```bash
docker compose -f compose.yml ps
```

### 查看日志
```bash
docker compose -f compose.yml logs -f webclient
```

### 常见排查
- 页面可打开但接口失败：检查 `.env` 中的 `BASE_URL` 是否可从当前运行环境访问。
- WebSocket 请求或实时事件未同步：确认上游 `BASE_URL` 实际提供 `/ws`，并检查浏览器连接的是 `/ws`；开发模式下如果看到 `/__webpack_hmr`，那是 Webpack 自身的热更新通道。
- 语音入口未出现或语音链路连接失败：检查 `.env` 中的 `VOICE_BASE_URL` 是否已设置且可访问，并确认上游服务实际提供 `/api/voice/ws`。
- `npm start` 启动即报代理配置错误：通常是 `.env` 缺失，或 `BASE_URL` 为空。
- SSE 兼容模式异常：确认上游接口 `/api/query` 可用，并检查反向代理是否关闭缓冲；默认产品链路应优先排查 `/ws`。
- 本地启动端口冲突：修改 `.env` 中的 `PORT` 后重新执行 `make dev`。
- 容器部署后刷新 404：确认 nginx 模板已正确加载，且 `try_files $uri /index.html;` 未被改坏。

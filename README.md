# agent-webclient

## 1. 项目简介
`agent-webclient` 是一个 AGENT 协议调试前端，用于连接 `/api/*` 接口，支持流式对话、历史回放、Team/Agent 切换、前端工具展示、语音输入与 TTS 播放等调试能力。

当前仓库只提供 Web 客户端。发布链路分为两类：

- Program Bundle：宿主机部署包，包含静态资源、Express 代理后端和宿主机元数据
- Image Bundle：包含离线 Docker 镜像、compose 和运行脚本的镜像部署包

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
- `BASE_URL`：runner HTTP API 基地址
- `VOICE_BASE_URL`：语音 WebSocket 服务基地址
- `NODE_ENV`：本地默认保持 `development`

### 安装依赖
```bash
make install
```

### 本地启动
```bash
make dev
```

默认访问地址为 [http://localhost:11948](http://localhost:11948)。开发模式下，Webpack Dev Server 会将普通 `/api/*` 代理到 `BASE_URL`，并将非语音 JSON API 默认通过 `/ws` 转发到 `BASE_URL`。语音 WebSocket 使用 `/api/voice/ws` 单独代理到 `VOICE_BASE_URL`。Webpack 自身的热更新 WebSocket 会使用内部路径 `/__webpack_hmr`，避免与业务 `/ws` 冲突。SSE 仅保留为手动兼容模式。

### 本地验证 Program Bundle 后端
```bash
make build
node backend/server.js
```

该命令会启动 Express 后端并托管生产构建产物。仓库内运行时会优先读取根目录 `dist/`；解压后的 Program Bundle 运行时会读取 `frontend/dist/`。

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

该命令会先生成生产环境 `dist/`，再输出带 Node.js 后端的版本化压缩包：

- macOS：`dist/release/agent-webclient-vX.Y.Z-darwin-arm64.tar.gz`
- Windows：`dist/release/agent-webclient-vX.Y.Z-windows-amd64.zip`
- 解压目录：`agent-webclient/`

Program Bundle 约束：

- 包内包含 `manifest.json`、`.env.example`、`README.txt`、`backend/server.js`、`backend/package.json`、`backend/node_modules/`、`frontend/dist/`、`start.*`、`stop.*`、`deploy.*`
- Desktop 内运行时会通过 `.env` 中的 `NODE_BIN` 使用 Electron 自带 Node；独立部署时回退到系统 Node.js 18+
- 版本号来自根目录 [`VERSION`](./VERSION)，格式固定为 `vX.Y.Z`

## 3. 配置说明
- 环境变量契约以 [`.env.example`](./.env.example) 为准，本地通过 `cp .env.example .env` 初始化。
- `.env` 为本地真实配置，不提交版本库；仓库只追踪 `.env.example`。
- 当前仓库不使用额外的 `configs/*.yml`；配置优先级为“代码默认值 < 环境变量”。
- `BASE_URL` 与 `VOICE_BASE_URL` 都不在代码、脚本或容器编排里写死，统一从 `.env` 提供。
- 开发模式、容器部署和 release 构建复用同一组变量名，但各自的实际值应由当前环境决定。
- `PORT` 在本地开发时表示 dev server 端口，在 [`compose.yml`](./compose.yml) 中表示宿主机暴露端口。
- 容器代理配置位于根目录 [`nginx.conf`](./nginx.conf)，启动时通过 `envsubst` 注入 `BASE_URL` 与 `VOICE_BASE_URL`。
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
- `.env` 中的 `VOICE_BASE_URL` 已指向可访问的语音 WebSocket 服务
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
- 解压后根目录固定为 `agent-webclient/`，其下包含 `manifest.json`、`.env.example`、`README.txt`、`backend/`、`frontend/dist/`、`start.*`、`stop.*`、`deploy.*`。
- 打包完成后，工作区只保留 `dist/release/` 下的最终压缩包，不保留展开的 `dist/js`、`dist/css`、`dist/fonts`。

### Program Bundle 使用
```bash
tar -xzf dist/release/agent-webclient-vX.Y.Z-darwin-arm64.tar.gz
cd agent-webclient
cp .env.example .env
./deploy.sh
./start.sh --daemon
```

部署端需要至少确认：
- `.env` 中的 `BASE_URL` 指向可访问的 AGENT HTTP API。
- `.env` 中的 `VOICE_BASE_URL` 指向可访问的语音 WebSocket / HTTP 上游。
- 已安装 Node.js 18+，或者由 Desktop 自动注入 `NODE_BIN`。
- `PORT` 未与宿主机其他服务冲突，默认值为 `11948`。

启动后可通过 `./stop.sh` 停止服务。

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
- `.env` 中的 `VOICE_BASE_URL` 指向可访问的语音 WebSocket / HTTP 上游。
- `.env` 中的 `HOST_PORT` 未与宿主机其他服务冲突，默认值为 `11948`。
- Linux Docker 环境下，bundle 自带的 `compose.release.yml` 已补齐 `host.docker.internal:host-gateway` 映射。

### 发布验证
建议按以下顺序验证：

1. `make release`
确认生成对应平台压缩包，解压后包含 `manifest.json`、`.env.example`、`README.txt`、`backend/server.js`、`backend/node_modules/`、`frontend/dist/`、`start.*`、`stop.*`、`deploy.*`。

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
- 语音链路连接失败：检查 `.env` 中的 `VOICE_BASE_URL` 是否可访问，并确认上游服务实际提供 `/api/voice/ws`。
- `npm start` 启动即报代理配置错误：通常是 `.env` 缺失，或 `BASE_URL` / `VOICE_BASE_URL` 为空。
- SSE 兼容模式异常：确认上游接口 `/api/query` 可用，并检查反向代理是否关闭缓冲；默认产品链路应优先排查 `/ws`。
- 本地启动端口冲突：修改 `.env` 中的 `PORT` 后重新执行 `make dev`。
- 容器部署后刷新 404：确认 nginx 模板已正确加载，且 `try_files $uri /index.html;` 未被改坏。

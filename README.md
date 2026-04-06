# agent-webclient

## 1. 项目简介
`agent-webclient` 是一个 AGENT 协议调试前端，用于连接 `/api/*` 接口，支持流式对话、历史回放、Team/Agent 切换、前端工具展示、语音输入与 TTS 播放等调试能力。

## 2. 快速开始
### 前置要求
- Node.js 18+
- npm 9+
- GNU Make
- Docker Desktop 或 Docker Engine + Compose v2（容器部署 / release 打包）
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

默认访问地址为 [http://localhost:11948](http://localhost:11948)。开发模式下，Webpack Dev Server 会将普通 `/api/*` 代理到 `BASE_URL`，并将 `/api/voice/ws` 单独代理到 `VOICE_BASE_URL`。

### Electron 本地启动
```bash
npm run start:electron
```

这个命令会先检查 Electron 运行时是否安装完整，再编译 Electron 主进程代码、启动现有 Webpack Dev Server，并让桌面壳层加载当前 `.env` 中 `PORT` 对应的本地地址，默认仍是 [http://127.0.0.1:11948](http://127.0.0.1:11948)。首版开发模式继续复用 `.env` 里的 `BASE_URL` / `VOICE_BASE_URL`。

### Electron 安装损坏修复
如果 `npm run start:electron` 报错 `Electron failed to install correctly`，通常说明 workspace 根目录里 hoist 的 `electron` 包没有成功完成 `postinstall`，缺少 `path.txt` 或 `dist/` 二进制。

先执行：
```bash
pnpm --dir /Users/ther/project/zenmind --filter agent-webclient rebuild electron
```

然后确认 Electron 包目录下已经生成 `path.txt` 和 `dist/`，再执行：
```bash
pnpm --dir /Users/ther/project/zenmind/agent-webclient run start:electron
```

如果 `rebuild` 之后仍然缺少 Electron 二进制，再直接执行当前 Electron 包里的安装脚本：
```bash
node /Users/ther/project/zenmind/node_modules/.pnpm/electron@37.10.3/node_modules/electron/install.js
```

不要使用 `pnpm run install` 作为修复手段。当前 monorepo 根目录的 install 脚本会再次调用 `pnpm install`，容易形成递归输出和卡顿。

### 测试
```bash
make test
```

### 生产构建
```bash
make build
```

### Electron 构建
```bash
npm run build:electron
```

这一步只编译桌面端 `main` / `preload` / 本地代理服务，不替代前端 `build:web`。

## 3. 配置说明
- 环境变量契约以 [`.env.example`](./.env.example) 为准，本地通过 `cp .env.example .env` 初始化。
- `.env` 为本地真实配置，不提交版本库。
- 当前仓库不使用额外的 `configs/*.yml`；配置优先级为“代码默认值 < 环境变量”。
- `BASE_URL` 与 `VOICE_BASE_URL` 都不在代码、脚本或容器编排里写死，统一从 `.env` 提供。
- 开发模式和容器部署复用同一组变量名，但两者的实际值应由当前环境决定。
- Electron 打包后的桌面端不再依赖 `.env` 里的上游地址，而是优先按以下顺序读取桌面配置：
  1. 同时存在的 `BASE_URL` + `VOICE_BASE_URL`
  2. `AGENT_WEBCLIENT_DESKTOP_CONFIG` 指向的 JSON 文件
  3. Electron `userData` 目录下的 `desktop.config.json`
- `PORT` 在本地开发时表示 dev server 端口，在 [`compose.yml`](./compose.yml) 中表示宿主机暴露端口。
- 容器代理配置位于根目录 [`nginx.conf`](./nginx.conf)，启动时通过 `envsubst` 注入 `BASE_URL` 与 `VOICE_BASE_URL`。
- 发布版本号以根目录 [`VERSION`](./VERSION) 为唯一来源，正式版本格式固定为 `vX.Y.Z`。

桌面端配置文件最小格式如下：
```json
{
  "baseUrl": "http://host:11949",
  "voiceBaseUrl": "http://host:11953"
}
```

仓库根目录提供了 [`desktop.config.example.json`](./desktop.config.example.json) 作为模板。若打包后的桌面端缺少配置，应用会在 `userData` 目录自动生成 `desktop.config.example.json` 并弹出错误提示。

## 4. 部署
### Electron 打包
```bash
npm run dist:mac
npm run dist:win
```

打包产物输出到 `dist/desktop/`：
- macOS：`dmg` + `zip`
- Windows：`nsis`

首版 Electron 产物为 unsigned 包，不包含签名、公证和自动更新。

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

### 版本化离线发布
```bash
make release
```

也可以按目标架构显式执行：
```bash
ARCH=amd64 make release
ARCH=arm64 make release
```

发布规则：
- `make release` 会读取根目录 `VERSION`，校验格式必须为 `vX.Y.Z`。
- 打包过程会在宿主机构建前端静态资源，再用 `docker buildx` 生成单架构运行镜像。
- 如果根目录 `.env` 缺失，release 构建会自动回退到 `.env.example`，并强制使用 production 模式完成前端打包。
- 最终 bundle 输出到 `dist/release/`，命名格式为 `agent-webclient-vX.Y.Z-linux-<arch>.tar.gz`。
- bundle 内包含 `images/agent-webclient.tar`、`compose.release.yml`、`.env.example`、`start.sh`、`stop.sh`、`README.txt`，目标机无需源码即可部署。
- release bundle 保持独立前端入口，不做 gateway 子路径集成；默认入口仍是 `http://127.0.0.1:11948`。
- desktop-core 只需要向 bundle 目录下的 `.env` 注入 `BASE_URL`、`VOICE_BASE_URL`，可按需覆盖 `HOST_PORT`；无需新增专属 profile 字段。

### 离线 bundle 部署
```bash
tar -xzf dist/release/agent-webclient-vX.Y.Z-linux-amd64.tar.gz
cd agent-webclient
cp .env.example .env
./start.sh
```

部署端需要至少确认：
- `.env` 中的 `BASE_URL` 指向可访问的 AGENT HTTP API。
- `.env` 中的 `VOICE_BASE_URL` 指向可访问的语音 WebSocket / HTTP 上游。
- `.env` 中的 `HOST_PORT` 未与宿主机其他服务冲突，默认值为 `11948`。
- Linux Docker 环境下，bundle 自带的 `compose.release.yml` 已补齐 `host.docker.internal:host-gateway` 映射，适配 desktop-core 注入的上游地址。

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
- 语音链路连接失败：检查 `.env` 中的 `VOICE_BASE_URL` 是否可访问，并确认上游服务实际提供 `/api/voice/ws`。
- `npm start` 启动即报代理配置错误：通常是 `.env` 缺失，或 `BASE_URL` / `VOICE_BASE_URL` 为空。
- `npm run start:electron` 立即失败且提示 Electron 安装不完整：先执行 `npm run check:electron-install` 查看当前解析到的 Electron 包路径，再按上面的 `rebuild electron` 步骤修复。
- Electron 打包后启动即提示配置错误：检查 `desktop.config.json` 是否存在且为合法 JSON，或确认 `BASE_URL` / `VOICE_BASE_URL` 是否成对注入。
- Electron 能打开但接口失败：确认桌面端读取到的 `baseUrl` / `voiceBaseUrl` 可从当前机器直接访问。
- SSE 长连接异常：确认上游接口 `/api/query` 可用，并检查反向代理是否关闭缓冲。
- 本地启动端口冲突：修改 `.env` 中的 `PORT` 后重新执行 `make dev`。
- 容器部署后刷新 404：确认 nginx 模板已正确加载，且 `try_files $uri /index.html;` 未被改坏。

# AGENT Webclient

AGENT 协议调试前端（Vanilla JS + Vite）。

文档事实源已迁移至 `.doc/`：
- 入口指引：`.doc/GUIDE.md`
- API 契约：`.doc/api/SPEC.md`
- 架构说明：`.doc/architecture/SYSTEM.md`

## 快速启动

### 环境要求
- Node.js 18+
- 可访问 AGENT 后端 API

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```
默认地址：`http://localhost:11948`

### 构建与预览
```bash
npm run build
npm run preview
```
默认预览地址：`http://localhost:4173`

### 测试
```bash
npm test
```

## 环境变量
- `AGENT_API_TARGET`：上游代理地址（默认 `http://127.0.0.1:11949`）
- `PORT`：开发端口（默认 `11948`）
- `PREVIEW_PORT`：预览端口（默认 `4173`）

## Docker
```bash
docker compose up -d --build
```

更多部署细节见：`.doc/architecture/DEPLOYMENT.md`

# 技术栈与版本

## 1. 运行时
- Language: `JavaScript (ESM)`
- Runtime: `Node.js 18+`
- Build Tool: `Vite 5`
- Test: `Vitest`

## 2. 核心依赖
- `vite@^5.4.11`
- `vitest@^2.1.8`
- `marked@^17.0.3`
- `katex@^0.16.22`

## 3. 协议与通信
- 非流式接口：`application/json`
- 流式接口：`text/event-stream`
- API base path: `/api/ap`

## 4. 部署组件
- 开发：Vite dev server
- 生产：Nginx + 静态资源
- 容器编排：`docker compose`

## 5. 版本策略
1. Node 版本保持 `18+`。
2. 核心构建/测试依赖采用兼容区间，升级需回归 `npm test` 与 `npm run build`。
3. 协议消费语义变更需先更新 `.doc/api/*`。

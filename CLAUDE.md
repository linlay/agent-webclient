# CLAUDE.md

本文件保留协作红线与入口导航。完整规范请查阅 `.doc/`。

文档入口：`.doc/GUIDE.md`

## 1. 项目定位
`agent-webclient` 是 AGENT 协议调试前端，不是生产业务前端。

## 2. 协作红线
1. 不改后端协议语义；本仓库是消费方。
2. 新增事件处理必须保持 `live/history` 一致行为。
3. 解析失败必须进入 debug，不可静默吞掉。
4. 涉及 `tool/action` 消息结构变更时，必须同步文档与测试。
5. Debug 展示与状态上限保持受控（`MAX_EVENTS` 限制）。
6. 契约改动先改 `.doc`，再改代码。

## 3. 快速事实
- 前端：Vanilla JS (ESM)
- 构建：Vite 5
- 测试：Vitest
- Node：18+
- API 前缀：`/api/ap`

## 4. 回归命令
```bash
npm test
npm run build
```

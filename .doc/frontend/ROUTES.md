# 前端页面区块路由语义

> 本项目为单页调试控制台，无前端 URL 路由系统；以下为“页面区块语义路由”。

| 区块路径语义 | 页面区块 | 登录依赖 | 角色要求 | 对应后端模块 |
|---|---|---|---|---|
| `chat` | 聊天与时间线主区 | 需要 token | 无角色细分 | `query-stream`/`chat-history` |
| `debug/events` | Events 调试面板 | 需要 token | 无角色细分 | `event-stream` |
| `debug/logs` | Logs 调试面板 | 需要 token | 无角色细分 | `event-stream` |
| `debug/tools-actions` | Tools/Actions 面板 | 需要 token | 无角色细分 | `event-stream`/`submit` |
| `settings/token` | Token 设置面板 | 强制可见（缺失时） | 无角色细分 | `auth` |
| `tool/host` | Frontend Tool iframe 区域 | 需要 token | 无角色细分 | `viewport`/`submit` |

## 约束
1. token 缺失时优先显示 `settings/token` 语义区块。
2. streaming 期间普通发送受控，前端工具待提交时禁止发送普通消息。

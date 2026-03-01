# 2026-03-01 doc-restructure

## 变更类型
- 文档结构重整
- 规范迁移

## 影响范围
- 文档：`.doc/**`, `README.md`, `CLAUDE.md`
- 代码：无

## 主要变更
1. 新增 `.doc` 作为设计事实源，按 architecture/api/backend/frontend/changelog 分层。
2. API 文档按协议能力拆分：`agents/chats/chat-history/query-stream/viewport/submit/event-stream`。
3. README 与 CLAUDE 调整为入口索引 + 必要约束，避免重复维护。

## 旧结构到新结构映射
| 旧结构 | 新结构 | 迁移动作 |
|---|---|---|
| `README.md` 运行/部署/操作说明 | `.doc/architecture/DEPLOYMENT.md` + `.doc/frontend/pages/*.md` + `.doc/api/modules/*.md` | 拆分为部署、页面交互、接口契约 |
| `CLAUDE.md` 架构分层与状态模型 | `.doc/architecture/SYSTEM.md` + `.doc/frontend/STATE.md` | 按架构与状态职责拆分 |
| `CLAUDE.md` 事件消费规则 | `.doc/api/modules/event-stream.md` | 归档为事件契约文档 |
| `README.md` + `CLAUDE.md` 全量规范 | `.doc/GUIDE.md` | 合并为统一文档入口 |

## `[DOC-GAP]` 决策记录
### 1) 错误码分段策略缺失
- 状态：待确认
- 默认策略：`code=0` 成功，`code!=0` 统一失败。
- 候选方案：
  - A：继续保持 0/非0 二分（当前采用）
  - B：对齐上游错误码分段后更新

### 2) 上游后端内部模块未知
- 状态：已确认边界处理
- 决策：backend 文档仅记录外部可观测契约，不描述内部实现。

## 迁移与回滚
- 迁移：以 `.doc` 为主，README/CLAUDE 保留索引。
- 回滚：可恢复 README/CLAUDE 全量内容，但不建议双写。

## 后续动作
1. 与上游确认错误码分段策略并回填 `.doc/api/SPEC.md`。
2. 如上游发布事件 payload 字段规范，补充 `event-stream.md` 字段表。

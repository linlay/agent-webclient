# 2026-03-01 api-doc-refine-no-backend

## 变更类型
- 文档结构增量重整
- API 规范补强

## 影响范围
- 文档：`.doc/GUIDE.md`、`.doc/api/SPEC.md`、`.doc/architecture/SYSTEM.md`、`.doc/architecture/DATA_FLOW.md`、`.doc/frontend/ROUTES.md`、`CLAUDE.md`
- 目录：`.doc/backend/**`（删除）
- 模板：`.doc/api/_template.md`、`.doc/frontend/_template.md`（删除）
- 代码：无

## 结论
- 决策：本仓库按 frontend-only 管理文档，不再维护 backend 文档层。
- 原因：仓库职责是上游 AGENT 协议消费方，后端内部实现不在可验证范围内。

## API 补强项
1. 在 `api/SPEC.md` 新增 frontend-only 边界声明。
2. 明确 SSE 失败处理统一准则（建链失败、帧解析失败、语义分叉）。
3. 保持错误码默认策略：`code=0` 成功，`code!=0` 失败。
4. 移除 `_template.md`，避免与已固化模块文档重复维护。

## 旧结构到当前结构映射
| 旧结构 | 新结构 | 迁移动作 |
|---|---|---|
| `.doc/backend/MODULE_MAP.md` | `.doc/api/SPEC.md` + `.doc/architecture/SYSTEM.md` | 将“依赖边界”收敛到 API/架构层 |
| `.doc/backend/BUSINESS_LOGIC.md` | `.doc/architecture/DATA_FLOW.md` + `.doc/api/modules/*.md` | 将前端可观测链路迁入数据流与模块契约 |
| `.doc/backend/DATABASE.md` | 删除 | 纯前端仓库不记录数据库层 |
| `.doc/backend/modules/*.md` | `.doc/api/modules/*.md` | 外部可观测接口保留在 API 模块文档 |

## `[DOC-GAP]` 跟踪
### 错误码分段策略缺失
- 状态：待确认
- 默认：`code=0` success，`code!=0` failure
- 候选：
  - A：继续维持二分规则（当前采用）
  - B：上游发布错误码分段后回填

## 迁移与回滚
- 迁移：删除 `.doc/backend/`，并修复 GUIDE/架构入口与边界描述。
- 回滚：可恢复 `.doc/backend/` 历史文档，但会引入双重事实源，不建议长期保留。

## 后续动作
1. 与上游确认错误码分段策略后更新 `.doc/api/SPEC.md` 与模块失败场景表。
2. 若上游发布事件字段稳定规范，补充 `.doc/api/modules/event-stream.md` 字段表。

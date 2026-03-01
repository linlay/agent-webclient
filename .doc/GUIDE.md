# 文档指引（GUIDE）

本目录是 `agent-webclient` 的设计事实源（Single Source of Truth）。

## 1. 文档规则
1. 契约改动先更新 `.doc`，再改代码实现。
2. 若实现与文档冲突，必须先标记 `[DOC-GAP]`，不得直接拍板。
3. 文档变更必须记录到 `.doc/changelog/`。
4. 路径、标识符、接口字段保持英文；解释说明默认中文。
5. 模块文档文件名统一使用 `kebab-case`。

## 2. 阅读顺序
1. `.doc/GUIDE.md`
2. `.doc/api/SPEC.md`
3. `.doc/api/AUTH.md`
4. `.doc/api/modules/*.md`
5. `.doc/architecture/*.md`
6. `.doc/frontend/*.md`
7. `.doc/changelog/*.md`

## 3. 术语与命名约束
| 术语 | 代码标识 | 含义 | 禁止别名 |
|---|---|---|---|
| Chat | `chatId` | 会话主键 | conversationId |
| Run | `runId` | 一次 query 的运行实例 | taskId |
| Event | `event` | AGENT 协议事件对象 | packet |
| Tool | `tool.*` | 工具生命周期事件 | plugin |
| Action | `action.*` | 浏览器动作生命周期事件 | command |
| Streaming | `streaming` | SSE 实时消费状态 | liveMode |

## 4. 禁止行为
1. 禁止发明文档未定义的接口、字段、事件名、错误码。
2. 禁止把上游后端内部实现写成既定事实。
3. 禁止在 `README.md` 与 `CLAUDE.md` 重复维护完整规范。
4. 禁止绕过 `[DOC-GAP]` 流程直接修改契约相关实现。

## 5. `[DOC-GAP]` 处理流程
1. 在相关文档标注 `[DOC-GAP]` + 影响路径 + 冲突点。
2. 说明现象、风险边界与当前默认行为。
3. 提供候选方案（改文档 / 改实现）及影响。
4. 获得确认后固化规则并更新对应模块文档。
5. 在 `.doc/changelog/` 记录最终决策。

## 6. 导航索引
- 架构总览：`architecture/SYSTEM.md`
- 技术栈：`architecture/TECH_STACK.md`
- 数据流：`architecture/DATA_FLOW.md`
- 部署：`architecture/DEPLOYMENT.md`
- API 总规范：`api/SPEC.md`
- API 鉴权：`api/AUTH.md`
- API 模块：`api/modules/*.md`
- 前端设计：`frontend/*.md` 与 `frontend/pages/*.md`
- 变更记录：`changelog/*.md`

## 7. 覆盖范围
本 `.doc` 覆盖：
- 前端运行态与 UI 行为约束
- 上游 AGENT API 消费契约（REST + SSE）

不覆盖：
- 任何后端内部模块/数据库实现

## 8. AI 编程规则（frontend-only）
1. 编码前按 `.doc/GUIDE.md -> .doc/api/SPEC.md -> .doc/api/modules/* -> .doc/frontend/*` 阅读。
2. 契约改动先改 `.doc`，再改代码。
3. 禁止发明未定义接口、字段、事件名、错误码。
4. 遇到契约缺口必须标记 `[DOC-GAP]`，并给出“改文档 / 改实现”候选方案与影响。
5. 文档变更必须新增 `changelog/` 记录。
6. 本仓库不维护 backend 实现文档，仅维护上游 API 消费边界。

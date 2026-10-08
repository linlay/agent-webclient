# VIEW 视图容器

## 当前状态
统一使用 `view` 引用：source 为 builtin/connector，renderer 为 native/html/qlc。内置 native 组件由宿主渲染；HTML 与 QLC 从 `/api/view` 获取，通过隔离 iframe 展示。旧 viewport 字段、接口和 Markdown viewport 块已硬切移除。

## 核心流程
Markdown 的 `view` fence 生成 view segment，由 `ViewEmbed` 加载模板并发送 `view_init/view_update`。内置引用可写 `{"view":{"key":"platform_control_review"},"payload":{}}`；连接器引用使用 connectorId/key，历史版本通过 hash 固定。旧 viewport fence 保留为普通 Markdown，不请求模板。

HITL 表单继续使用 `forms[]` 和 `params[]`。`AwaitingHtmlContainer` 通过统一 view loader 获取 HTML，再使用 awaiting_init/update/collect 协议；展示 VIEW 没有提交能力。Team 的 builtin/team-hitl 使用宿主成员组件，汇总后一次提交。

## 边界
VIEW 是展示模板，Artifact 是文件资源。所有 HTML 使用 sandbox=allow-scripts 与宿主 CSP，不授予同源或工具执行权限。模板来源、Chat 授权和快照由 Platform 管理；Gateway 另需 Run 或 Chat 路由上下文。

## 相关文件
- `src/shared/contracts/view.ts`
- `src/features/events/lib/contentSegments.ts`
- `src/features/timeline/components/ViewEmbed.tsx`
- `src/features/tools/hooks/useAwaitingFrameDocument.ts`
- `src/features/tools/components/AwaitingHtmlContainer.tsx`
- `src/features/tools/components/TeamAwaitingContainer.tsx`

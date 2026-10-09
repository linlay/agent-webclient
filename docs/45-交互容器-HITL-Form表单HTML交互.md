# HITL-Form表单HTML交互

## 当前状态
Form awaiting 使用后端 view 引用渲染交互表单。HTML/QLC 通过统一 `/api/view` 获取，iframe 内部通过 postMessage 与宿主通信，提交 form payload。

## 核心职责
- 归一化 forms，维护当前 form index 和 form meta。
- 加载 `/api/view` HTML 并注入 iframe。
- 向 iframe 发送 init/update/collect 消息。
- 仅在宿主主动 collect 后接收当前 iframe 的 submit，校验表单 ID，并构造 awaiting submit payload。

## 核心流程
`reduceActiveAwaiting` 进入 form 模式后保存 view、forms 和 runtime state。`AwaitingHtmlContainer` 拉取 HTML，iframe load 后发送初始化消息。用户提交时，宿主请求 iframe collect 数据，校验 payload 后调用 awaiting submit。

## 边界与非目标
- 普通 Form 使用 HTML/QLC；Team 的 builtin/team-hitl 由宿主渲染成员组件并汇总提交。
- iframe 内容必须 sandbox；跨 frame 消息只接受当前 iframe source。
- HTML 表单具体字段和验证规则由 view 内容与后端协议决定。

## 相关文件
- `../src/features/tools/components/AwaitingHtmlContainer.tsx`
- `../src/features/tools/lib/awaitingRuntime.ts`
- `../src/features/tools/hooks/useAwaitingFrameDocument.ts`
- `../src/features/tools/lib/protocol.ts`
- `../src/shared/data/api/routedClient.ts`
- `../src/features/tools/lib/toolsState.ts`

## 平台内置审阅表单

Platform 控制操作通过 `awaiting.ask(mode: form, view: {source: builtin, key: platform_control_review, renderer: html})` 复用容器。HTML 随 Platform 内置，业务内容全部位于 `forms[].form`，WebClient 不解释资源类型、版本或前后文本；通用 approval 不包含 review/fingerprint 扩展。

所有 HTML form iframe 统一使用 `sandbox="allow-scripts"`，宿主通过 init/update 附带 locale 与 colorScheme。模板只响应宿主 collect；主动 submit/close、重复响应、未知或重复表单 ID 均不能提交。拒绝不等待 HTML 响应；倒计时只更新 UI，由后端结束等待，不自动批准。旧模板需要实现 awaiting_collect，不能依赖同源访问或自行提交。

容器按 HTML 上报的正文高度收缩或增高，整体仍限制最大高度，超出时 iframe 内部滚动，标题和底部操作保留空间。HTML 可发送 `awaiting_resize`，携带 `runId`、`awaitingId`、`formId` 与正数 `height`（CSS 像素）；宿主仅接受当前 iframe、当前表单的有限数值，不触发提交。未实现高度上报的模板保留 420px 默认高度。Platform 的内置 view 加载入口为所有 HTML 统一注入尺寸桥接，包括独立安装页；新增内置模板也自动获得该能力。桥接监听内容尺寸变化，展开、收起、语言及宽度变化后重新上报；测量自然正文高度，避免使用受 iframe 当前高度影响的 document scrollHeight。外部 VIEW 或内联 HTML 可使用同一上报协议，未实现时仍保留默认高度。Platform 模板只读，默认展示差异，完整文本折叠。


## 独立输入表单 ask_user_form

Platform 的 `ask_user_form` 复用 `mode:form`，VIEW 为 `{source:"builtin",key:"ask_user_form",renderer:"html"}`，`form.data` 保存 `{html,values}`。它只收集用户输入，不授予执行权限，不属于业务审阅，也不支持跨进程重启恢复。Agent 必须显式声明该工具。

宿主为这个内置 VIEW 显示“提交 / 不填写”，仍发送 `awaiting_collect`。壳页面在提交前执行浏览器表单校验；失败后发送 `frontend_awaiting_invalid`，携带 `runId/awaitingId`。宿主只接受当前 iframe、当前等待项且正在 collect 的反馈，立即清除 collect 超时与忙状态，允许用户修改后重试；拒绝不要求字段有效，并携带已填内容及宿主输入的原因。

收集结果仅包含按控件 name 命名的字符串或字符串数组；单 checkbox 为字符串 true/false，同名 checkbox 与多选 select 为数组，未选 radio 省略。模板的 `{html,values}` 不被回答覆盖，提交失败后保留当前输入。不能收集时的拒绝省略 data，不能把 HTML 模板当成用户答案。

验证：自动测试覆盖按钮文案、来源与身份校验、无请求反馈忽略和校验失败后重试；目标 Desktop 的深色主题、原生校验气泡和 Team 排队仍需手工联调。

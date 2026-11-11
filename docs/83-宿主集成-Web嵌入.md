# Web 嵌入

## 当前交付与边界

WebClient 新增独立 `/embed/:agentKey` Surface 与 `/embed/v1.js` SDK。默认关闭，部署者必须显式开启并配置允许的父页面 origin。业务 Provider 在可信父页面经 MessageChannel 提交有效格式的受限凭据后才挂载；真正的签名、身份和权限校验由服务端执行。宿主与 WebClient 必须跨源。

本次仅实现 WebClient 消费端，不包含公网托管服务、Gateway embed token 签发/验签、资源 ACL、WS 撤销或限流。现有 Desktop Program Bundle 仍是正式发布方式，不因新增路由自动具备公网嵌入部署。Gateway 现有 cookie 登录不能代替 embed Bearer 授权；后端尚未支持时不能宣称端到端可用。

## 部署配置

开发 `.env` 或托管层注入的 runtime config：

```dotenv
EMBED_ENABLED=true
EMBED_ALLOWED_ORIGINS=https://portal.example.com,http://localhost:3000
```

白名单仅接受精确 origin，不支持星号、路径、尾斜杠或不透明 origin；HTTP 仅允许 loopback 开发源。URL 的 `parentOrigin` 是握手目标提示，不能扩大部署白名单。当前配置是部署级白名单，多应用隔离与动态应用配置须由后端和托管层进一步实现。

正式托管还必须提供：

- `/embed/*` 的 SPA fallback；`/embed/v1.js` 必须优先命中静态文件而非 fallback。
- HTTPS，以及同源 `/api/*`、`/ws` 转发；WS 保留 WebClient origin。
- `/embed/*` 的 HTTP `Content-Security-Policy: frame-ancestors ...` 与前端允许列表一致；普通登录和管理页不开放第三方嵌入。避免冲突的 `X-Frame-Options`。`frame-ancestors` 不通过 meta 下发。
- SDK 与应用资产的缓存、版本配套、回滚；敏感接口不缓存。WS 查询串中的 token 在访问日志、追踪和错误监控中脱敏。

## SDK 接入

```html
<div id="agent" style="height:640px"></div>
<script src="https://agent.example.com/embed/v1.js"></script>
<script>
const chat = ZenmindChat.mount('#agent', {
  agentKey: 'support',
  // 由宿主后端验证当前用户，再向授权服务换取受限 embed 凭据。
  getToken: async () => {
    const response = await fetch('/api/zenmind/embed-token', { method: 'POST' });
    if (!response.ok) throw new Error('授权失败');
    return response.json(); // { token: string, expiresAt: number /* Unix 毫秒 */ }
  },
  // chatId: savedChatId,
  theme: 'light',
  locale: 'zh-CN',
  features: { history: true, attachments: true, newChat: true },
  context: { page: 'order', orderId: '123' },
});
chat.on('chat.changed', ({ chatId }) => { /* 由宿主保存恢复指针 */ });
chat.on('auth.required', () => { /* 在宿主处理登录，iframe 不跳转 OIDC */ });
chat.ready.then(() => chat.focus());
// 页面卸载时：chat.destroy();
</script>
```

示例宿主接口是接入方自行实现的接口，不是本仓库新增的后端协议。`getToken` 返回值必须为对象，`expiresAt` 使用毫秒且未来有效。初始化获取凭据失败会触发 auth.required，宿主完成登录后应销毁并重新 mount；已经初始化的页面可使用 iframe 内的重新授权按钮。SDK 不根据 JWT 内容认定权限。建议凭据有效期大于 30 秒；每次需要刷新均重新调用 getToken。宿主能看到自己提供的 embed token，因此必须仅签发最小权限凭据，不能传完整登录 token。

SDK 固定 iframe sandbox：scripts、same-origin、popups、popups-to-escape-sandbox、downloads，不授权顶层导航、原生表单或麦克风。固定高度、内部滚动，最小宽度 320px。当前支持 theme 与 locale，不开放任意 CSS 或强调色注入。

## 消息桥与 API

握手：hello → 校验父窗口/origin/instanceId/随机 sessionId → 转移一个 MessagePort → connected → init → response。只有无秘密 hello/connect 使用 window 消息且使用精确 targetOrigin，token 与业务命令只走端口。每次 iframe 加载生成新 sessionId，旧端口被关闭，重复 requestId 不重复执行。默认握手超时 30 秒，刷新超时 15 秒，SDK 命令超时 20 秒；超时不证明写入未执行，不能盲目重发。

| SDK 接口 | 行为 |
| --- | --- |
| `ready` | Promise，Agent 及初始 Chat 完成加载后就绪；失败可能通过 error 事件及超时报告 |
| `on(type, handler)` | 订阅事件，返回取消函数 |
| `send(text)` | 使用 Composer 相同的 query/send/本地排队路径；有现存草稿、附件或不可交互时拒绝，避免覆盖人工输入 |
| `prefill(text)` | 替换草稿，不发送 |
| `setContext(value)` | 保存不超过 16 KiB UTF-8 JSON的宿主上下文；传 null 清除 |
| `openChat(chatId)` | 先校验目标 Chat 的 Agent，再加载；最终归属和 ACL 必须由后端拒绝越权 |
| `newChat()` | 要求 features.newChat；运行或待确认时拒绝；BOT 重启必须在 iframe 内确认影响并归档旧主聊天 |
| `interrupt()` | 走 Composer 原有中断路径，不直接中止 iframe 生命周期 |
| `setTheme(theme)` / `focus()` | 临时切换外观 / 聚焦输入框 |
| `destroy()` | 关闭端口、移除 iframe、清理监听与未决请求；不默认中断后端任务 |

命令响应仅表示前端命令处理结果。send 的 submitted/queued 不等于后端接受或 Run 完成；不能将它当作消息幂等收据。当前 SDK 不提供跨超时/重载的可靠发送重试，接入方不自动重发。

事件包括 ready、auth.refresh（SDK 内部处理）、auth.required、chat.changed、run.started、run.finished、awaiting.pending、link.open、error。run.finished 基于实际终态事件，reason 保留 run.complete/run.cancel/run.error，不暴露回复正文、工具参数、审批内容或凭据。当前不提供自动高度 resize；历史首批最多 100 条，无跨页搜索。BOT 不展示普通历史入口。

## 鉴权、存储与上下文

Embed 的鉴权来源独立于 backend mode。HTTP/SSE/上传/资源 fetch 使用内存 Bearer，同源 HTTP credentials=omit；Gateway Embed 不初始化 cookie session，不发 CSRF，不跳登录页。授权失效时在 iframe 内显示需要登录提示与重新授权按钮，宿主完成登录后可重试 getToken，不自动重发先前写请求。WS 使用既有 token 查询串路径，Gateway Embed 同样启用 token 刷新。临近过期或未授权读取合并刷新；GET/HEAD/OPTIONS 的 401 最多重试一次，写请求不自动重放。403 不触发刷新。已建立 WS 的鉴权到期/撤销仍由服务端实现。

偏好、草稿、模型、设备/Surface 标识、等待提交记录等 Web Storage 消费统一经 clientStorage 适配。Embed 使用 iframe 实例内存，不读取或写入普通页面的 localStorage/sessionStorage；刷新即清空。外观不加载普通页面 IndexedDB 中的自定义皮肤或背景。此策略避免同一页面多实例共享草稿，不把存储键前缀误当安全隔离。

宿主上下文以明确标注“外部数据、非指令”的普通用户消息附加段发送，不使用 Desktop 元数据或权限字段，不定义新后端协议字段。每次发送保留当时快照，排队时同样保留；空白继续和斜杠命令不附加上下文。上下文是接入方提供的信息，不能认定为用户授权或可信工具结果。

## 展示与业务约定

已有 Chat 先独立读取 /api/chat 校验目标身份，历史加载不等待 Agent hydration；Agent 不可用时保留历史并禁用发送。

保留 Timeline、Composer、HITL、规划内容与 Artifact/Reference/Resource 抽屉预览；不装配导航栏、Settings、命令中心、管理台、终端或项目浏览器。预览只读，外部 HTTP(S) 链接用 noopener/noreferrer 打开，不允许顶层导航。斜杠命令和 Agent 派生入口首期关闭。附件必须同时获得服务端 interactionConfig 与 features.attachments 允许；不显示连接器挂载、技能、知识库与聊天引用管理入口。

BOT 在 Platform 仍走 /api/send，首次不设置 primary:true；其他 mode 与 Gateway 保留 query/steer。待确认项的发送规则、附件排队与恢复、审批、VIEW 查询和动作授权沿用现有组件。语音、WebApp、跨 Run 最终结果关联没有在本次实现中交付。

## 验证

新增 Jest 覆盖 origin/source/nonce 校验、重复握手/消息、端口清理、凭据并发刷新、刷新后的会话隔离、Gateway Bearer/无 cookie、读取重试与写入不重放、外部目标拒绝、存储与 Desktop 隔离。

`qa/embed-host.html` 提供跨源、多实例、预填、发送、主题和销毁演示。它只用于开发联调，不负责签发 token；页面中声明的 expiresAt 不是服务端 token 有效期，不能替代后端验签。完整验收还需要支持 embed 的 Gateway/Platform，并检查 Chrome、Firefox、Safari、第三方存储禁用、320px 宽度、连接重建、HITL、附件及资源授权。

浏览器依据：[iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)、[存储分区](https://privacysandbox.google.com/cookies/storage-partitioning)。

# Execute 执行测试

智能体管理详情顶部提供“执行测试”。入口读取已加载详情的有效工具（`toolBindings` 或使用端 `tools`），包含活动且未排除的 `result_submit` 才能发起测试，不按 EXECUTOR mode 判断。使用已保存的 Agent 配置，编辑草稿不会提交。

弹窗采用左侧输入与配置、右侧执行结果的 3:2 双栏布局，中间设置独立的执行操作栏，两侧独立滚动；执行按钮使用正向图标和直立竖排文字，不旋转按钮；窄屏改为上下排列，执行按钮仍位于输入与结果之间。左侧依次展示任务说明、JSON 输入和输出格式；附件与权限默认折叠。字号沿用管理界面的 12px 表单、14px 标题，面板标题栏约 34px 高，字段间距 12px，减少重复提示。默认访问级别为 default。示例选择提供未完成任务筛选、人员与工时汇总、全部已完成和缺少任务数组四组预设，输入使用 projectId、members、tasks 组成的结构化记录，含人员 ID、完成状态、日期、工时等字段；message 使用自然语言描述业务目标，不重复字段名、关联步骤或输出字段。每组包含用途与预期说明，以及完整的 message、input、outputSchema；选择框位于“输入与配置”标题栏最右侧，选中示例即一次性替换三个字段并清除旧附件和结果，不额外占用表单行。初始输出格式仅为 object，不隐式加载某个示例的 Schema。完整 JSON Schema 合法性由 Platform 校验；前端只检查 JSON、根类型、64 KiB 上限与文件引用。

附件使用 `file_1`、`file_2` 等 multipart 字段，调用方在 input 中用 `{"$file":"file_1"}` 引用。允许多次引用同一附件，拒绝缺少或多余的附件、重复文件名和带多余属性的文件引用。文件选择不会先调用上传接口，文件与 request 在同一个 execute 请求中发送。

请求通过统一鉴权 HTTP 客户端发往 `POST /api/execute`，没有 WS 分支、缓存或自动重试。无附件发 JSON，有附件发 multipart，让浏览器生成 boundary。AbortController 绑定本次请求；取消、关闭弹窗或卸载组件会断开连接，平台据此中断 Run。运行时隐藏右上角关闭按钮并禁用 Esc，底部明确显示“停止并关闭”。关闭后无法凭 requestId 恢复执行结果。

结果区区分 success、智能体主动提交的 failure、平台错误。成功时优先显示 output，业务失败显示 reason，完整提交 JSON 可展开“原始响应”查看；平台错误保留错误信息与返回的 chatId。已知 chatId 时提供独立打开对应 Chat 的链接，不自动切换当前页面。

实现归属：

- `src/features/execute/`：表单校验、示例、界面和请求生命周期。
- `src/features/agents/components/AgentConsole.tsx`：有效工具入口与弹窗装配。
- `src/shared/data/api/dto/execute.ts`：公开请求、提交结果与附件 DTO。
- `src/shared/data/api/requests/execute.ts`：同步 HTTP 请求。
- `src/shared/data/api/endpoints.ts`：端点注册。

本地验证覆盖 JSON/multipart、附件引用、错误 chatId、取消与卸载。实际模型执行与部署代理长连接需要在已登录环境联调；构建成功不代表真实执行已验证。

# frontend-tool-host

## 页面目标
承载前端工具 iframe，完成 viewport 拉取与 submit 回传。

## 字段与校验
| 字段 | 来源 | 校验 |
|---|---|---|
| `viewportKey` | tool 事件 | 非空 |
| `runId` | run 上下文 | 非空 |
| `toolId` | tool 事件 | 非空 |
| `params` | iframe 回传 | 可序列化 JSON |

## 交互流程
1. 接收前端工具事件并切换输入区显示为 iframe。
2. 调用 `GET /api/ap/viewport` 获取 `data.html`。
3. iframe 触发 `frontend_submit`。
4. 调用 `POST /api/ap/submit` 回传参数。
5. 等待后续 `tool.*` / `run.*` 事件推进状态。

## 失败提示与重试
- viewport 拉取失败：在状态栏与 debug 显示错误。
- submit 失败：保留待提交状态，允许重新提交。
- run 终止时：清理工具覆盖层。

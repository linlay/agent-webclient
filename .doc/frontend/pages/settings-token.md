# settings-token

## 页面目标
集中管理 Access Token 的输入、应用、清空与错误提示。

## 字段与校验
| 字段 | 组件 | 前端校验 |
|---|---|---|
| `accessToken` | settings input | 去首尾空白；不能为空（发送前） |

## 交互流程
1. 首次进入若 token 为空，自动打开 settings。
2. 用户输入 token 并点击应用。
3. 前端写入内存态并刷新 agents/chats。
4. 用户可清空 token，后续请求不再携带认证头。

## 失败提示与重试
- token 空值提交：输入框红色高亮，提示后阻断。
- 拉取 agents/chats 失败：状态栏报错，可修复 token 后重试。

## 安全约束
1. token 禁止持久化到本地存储。
2. token 仅用于请求头 Bearer 注入。

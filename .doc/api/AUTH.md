# 认证与授权

## 1. API 鉴权入口
- 入口：前端请求头 `Authorization: Bearer <token>`
- 作用范围：`/api/ap/*`

## 2. Token 验证与注入规则
1. token 来源于 Settings 输入框，由前端内存态保存。
2. token 为空时不注入 `Authorization` 头。
3. token 非空时统一由 API 客户端注入 Bearer。
4. token 不写入 LocalStorage/SessionStorage/Cookie。

## 3. 失败行为
- 未认证：通常为 `401`，前端进入错误状态并提示。
- 无权限：通常为 `403`，前端进入错误状态并提示。
- 非标准失败壳：按 `ApiError` 处理。

## 4. 前端强约束
1. 首次进入 token 为空：自动弹 Settings + 红色高亮 + 状态栏报错。
2. 发送消息前 token 为空：阻断发送并再次弹窗。
3. 清空 token 后需要重新应用，后续请求不再带认证头。

## 5. 特例授权
- 图片或文件转发路径（如 `/api/ap/data`）仍遵循同源与认证头策略。
- 不定义匿名白名单接口，除非上游协议显式声明。

## 6. 安全边界
1. 本仓库只定义“前端如何携带 token”，不定义后端验签细节。
2. 不对 issuer/audience 等后端规则作臆测。

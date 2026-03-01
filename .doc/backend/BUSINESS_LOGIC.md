# 核心业务逻辑（边界版）

## 1. 前端视角主流程
```text
输入消息 -> query 流建立 -> 消费事件 -> 渲染 timeline/debug/tool/action -> run 终止
```

## 2. 前端视角工具流程
```text
tool 事件触发 -> 拉取 viewport -> iframe 回传 params -> submit -> 等待后续事件
```

## 3. 关键边界
1. 上游如何决策/编排任务不在本仓可见范围。
2. 本仓仅约束事件消费行为与 UI 状态转移。

## 4. 失败恢复
- API 或 SSE 异常：进入 `ApiError/debug` 路径。
- token 缺失：发送前阻断并强提示。

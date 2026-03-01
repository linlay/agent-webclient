# 组件与运行时边界

## 1. 组件分层
- 页面层：主控制台布局、侧栏、消息区、调试面板。
- 运行时层：timeline/status/plan/frontend-tool/viewport UI 逻辑。
- 协议层：API 请求、SSE 解析、提及解析、参数归一化。

## 2. 组件树（语义）
```text
<App>
  ├── <SidebarChats>
  ├── <MainTimeline>
  │    ├── <Messages>
  │    ├── <Reasoning>
  │    └── <PlanPanel>
  ├── <Composer>
  ├── <FrontendToolHost(iframe)>
  └── <DebugPanel>
       ├── <EventsTab>
       ├── <LogsTab>
       └── <ToolsActionsTab>
```

## 3. 复用与解耦规则
1. runtime 负责渲染与展示，不直接请求上游 API。
2. actions 负责流程控制，不直接操作复杂 DOM 细节。
3. handler 负责事件消费，不引入协议外事件语义。

## 4. 命名约束
- 文档页/模块文件名：`kebab-case`。
- 状态字段保持代码同名，不引入同义词。

# TerminalDock 多终端重构计划

## 概述

将 `TerminalDock` 从单终端组件重构为支持**一个智能体拥有多个终端**的标签页管理器。

## 当前状态分析

### 现有架构

- `TerminalDock` 是一个单实例组件，管理**一个** xterm 终端
- 在 `AppShell.tsx` 和 `AgentChatShell.tsx` 中条件渲染，条件为 `terminalDockOpen && currentWorker && isCoderAgent(currentWorker)`
- 通过 `isCoderAgent()` 判定编码智能体（`mode === "CODER"`）——**需求1已满足**
- 不同智能体使用不同 `agentKey` 传入 `TerminalDock`，各自拥有独立的 WS 流——**需求2已满足**
- 终端通过 `/api/terminal/open` 流式打开，返回 `terminalId` 后用于后续 input/resize/close

### 关键文件

| 文件 | 作用 |
|---|---|
| `src/app/layout/TerminalDock.tsx` | 终端组件主体，需重构 |
| `src/app/layout/AppShell.tsx` | 桌面布局中渲染 TerminalDock |
| `src/app/layout/AgentChatShell.tsx` | Agent 路由中渲染 TerminalDock |
| `src/features/workers/lib/currentWorker.ts` | `isCoderAgent()`、`resolveCurrentWorkerSummary()` |
| `src/app/state/types.ts` | AppState 类型定义 |

## 改造方案

### 组件结构

```
TerminalDock（标签页管理器）
├── 标签栏： [终端 1] [终端 2] [终端 3] [+ 新建]
├── TerminalPane（活跃标签页，可见）
│   ├── xterm 实例
│   ├── WebSocket 流
│   └── 输入/输出/缩放处理
├── TerminalPane（非活跃标签页，隐藏）
│   └── （保持连接但不可见）
└── ...
```

### 文件变更清单

#### 1. `src/app/layout/TerminalDock.tsx` — 核心重构

**提取 `TerminalPane` 子组件**

将现有单终端逻辑（xterm 初始化、WS 流管理、输入队列、resize 处理、主题同步）提取为独立组件 `TerminalPane`，Props：

```ts
interface TerminalPaneProps {
  agentKey: string;
  chatId: string;
  workspaceKey: string;
  isActive: boolean;       // 非活跃时隐藏，不处理 resize
  onClose: () => void;     // 关闭回调
  themeMode: string;       // 主题同步
}
```

**`TerminalDock` 改造为标签页管理器**

新增本地状态：

```ts
interface TerminalTab {
  id: string;       // 本地唯一标识（UUID）
  label: string;    // 显示标签，如 "终端 1"
}

const [tabs, setTabs] = useState<TerminalTab[]>([]);
const [activeTabId, setActiveTabId] = useState<string>("");
const [tabCounter, setTabCounter] = useState(0);
```

行为：
- **挂载时**：自动创建第一个终端标签页（保持向后兼容）
- **"+" 按钮**：新建标签 `{ id: uuid, label: "终端 N" }`，设为活跃
- **点击标签**：切换 `activeTabId`
- **关闭标签（x 按钮）**：移除标签，若为活跃则激活相邻标签；若无标签则 dock 显示空白或 "+" 按钮
- **agentKey 变化时**：全部清理，重新创建首个标签

#### 2. CSS 样式 — `src/shared/styles/globals.css` 或新建终端样式文件

- 标签栏样式：flex 水平排列，底部边框，活跃标签高亮
- "+" 新建按钮样式
- 终端面板容器：flex-column，标签栏固定高度，面板区 flex-grow

#### 3. `src/app/layout/TerminalDock.test.ts` — 测试更新

- 保持现有单终端测试
- 新增：新建标签页测试
- 新增：切换标签页测试
- 新增：关闭标签页测试
- 新增：agentKey 变化时标签重置测试

#### 4. `src/app/layout/AppShell.tsx` — 无需修改

现有条件 `isCoderAgent(currentWorker)` 已满足需求1，agentKey 隔离已满足需求2。

#### 5. `src/app/layout/AgentChatShell.tsx` — 无需修改

同上。

## 设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 标签状态存储 | 组件本地 `useState` | 终端是会话级功能，无需跨组件共享；关闭 dock 后标签重置可接受 |
| 非活跃终端 | 保持挂载（`display: none`） | xterm 需要保持尺寸才能正常接收输出；销毁重建会丢失缓冲区 |
| 首个终端 | 自动创建 | 保持向后兼容，用户打开 dock 即见终端 |
| 关闭最后一个终端 | 保留 dock 显示 "+" | 用户可能想立即新建 |
| 标签上限 | 不限制 | 由后端资源自行约束 |

## 验证步骤

1. `make dev` 启动开发服务器
2. 切换到编码智能体（mode=CODER），点击终端按钮
3. 验证自动创建第一个终端，输入命令正常响应
4. 点击 "+" 新建第二个终端，切换标签页，验证各自独立
5. 关闭一个标签页，验证另一标签页不受影响
6. 切换到另一个编码智能体，验证终端标签页完全重置
7. 切换到非编码智能体，验证终端不显示
8. `make test` 确保所有测试通过

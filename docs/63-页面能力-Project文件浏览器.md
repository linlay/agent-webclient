# Project 文件浏览器

## 定位与入口

Project 是 CODER 与专用 `mode: KBASE` 的只读 Workspace 浏览器，不向 Team 或其他 Agent 显示。对话顶部工具栏通过 `90vw × 85vh` Dialog 打开当前 Agent；独立页面使用 `/project`，查询参数保存 `agentKey`、`chatId`、`runId`、当前 `path`、重复的 `open` 文件标签与 `view=content|diff`。Dialog 的“在完整页面打开”会带上当前选择状态和全部已打开文件。

## 组件边界

- `src/features/project/components/ProjectWorkspace.tsx`：Dialog 与页面共享的目录、上下文选择、内容与 Diff 主组件。
- `src/features/project/components/ProjectWorkspaceDialog.tsx`：仅负责 Modal 壳和完整页面跳转。
- `src/app/pages/project/index.tsx`：加载 CODER/KBASE Agent，处理 URL 状态和无 Agent 选择器。
- `src/features/project/lib/projectRoute.ts`：Project 查询参数的读写纯函数。
- `src/features/project/lib/projectTabs.ts`：多文件标签的去重打开与相邻关闭选择规则。
- `src/features/artifacts/components/AttachmentPreviewPanel.tsx`：复用 Workspace 文本、图片、PDF、HTML、音视频预览。
- `src/app/layout/sidebar/right/FileDiffView.tsx`：复用两侧文本 Diff。

## 数据与刷新

Project 数据固定走 HTTP：

- `/api/project/tree` 单层懒加载目录，分页游标变化冲突时重载目录。
- `/api/project/changes` 读取当前 Chat 下按 Run 隔离的 file-history。
- `/api/project/diff` 一次读取原始与当前文本快照。
- `/api/file` 和 `response=content` 继续承担实时内容与媒体字节。

对话 Dialog 以当前 `fileChanges` 投影作为失效键，只刷新变更文件对应的已加载父目录、变更列表和命中的选中文件，不清空展开集合。独立页面只在可见状态下每 5 秒刷新，并在窗口重新聚焦时立即刷新；切换 Agent 会主动取消旧的 tree/changes/diff HTTP 请求，generation 校验再阻止迟到结果落入当前视图。

## 交互与边界

桌面端目录树默认 280px，可在 220–520px 之间拖动；小屏使用可展开侧栏。目录树支持名称过滤、懒加载、分页、变更徽标与手动刷新。点击文件会追加到右侧多文件标签栏；标签支持切换和关闭，关闭当前标签后选择相邻文件。文件标签、MIME/大小、下载图标和“内容 / Diff”页签共用一行，Dialog 与独立页的 Agent/Chat/Run/刷新动作也使用单行紧凑工具栏。

Project 文本预览固定显示行号；图片继续通过 `/api/file?response=content` 和现有鉴权资源预览显示。Project 隐藏附件预览的通用说明，但保留真正发生截断时的提示。二进制、超限、无 Run 快照等 Diff 错误以明确空态展示，不回退为伪 Diff。

首版没有保存、创建、重命名、删除、Terminal、拖拽上传或 Git Diff。实时内容可以包含 Bash/ACP/外部程序产生的变化，但只有 Platform `file_write/file_edit` 的 Run 快照会出现在变更列表和 Diff。

## 验证

```bash
npm test -- --runInBand src/features/project/lib/projectRoute.test.ts src/features/project/lib/projectTabs.test.ts src/features/artifacts/components/AttachmentPreviewPanel.test.ts src/shared/data/api/client.test.ts
npm run build
```

手工回归需覆盖直接访问 `/project`、Agent/Chat/Run 切换、浏览器前进后退、Dialog 到完整页面、目录分页与过滤、媒体预览、Diff 空态、页面隐藏暂停刷新，以及切换 Agent 后旧请求不再落入当前视图。

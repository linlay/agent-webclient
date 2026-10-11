# Project 文件浏览器

## 定位与入口

Project 是项目 Agent 的只读 Workspace 浏览器，每个页面实例通过 `/project/:agentKey` 固定一个项目，不提供项目选择或切换。直接读取该 Agent 的详情与最近 20 条会话，不加载全量项目目录；未配置具体 Workspace 或使用 `@root` 时显示不可浏览空态。裸 `/project` 显示缺少项目上下文，不自动选中其他项目。前端不按 mode 筛选，Platform 现有的项目接口 mode 限制继续由服务端校验。项目创建使用请求级 `isProject:true`，该标志不持久化。普通 Workspace/文件只需要 `path`，Chat 全量变更需要 `chatId`，指定 Run 才增加 `runId`，`view=diff` 必须同时具备 `chatId + runId + path`。

## 组件边界

- `src/features/project/components/ProjectWorkspace.tsx`：页面使用的目录、上下文选择、内容与 Diff 主组件。
- `src/app/pages/project/index.tsx`：只负责 `ProjectRouteState` 与 URL 双向适配。
- `src/features/project/components/ProjectConsole.tsx`：固定项目的空状态和 Workspace 装配。
- `src/features/project/hooks/useProjectAgent.ts`：按路由身份独立加载 Agent 详情与最近会话；会话加载失败不阻止文件浏览，路由变化后忽略旧响应。
- `src/features/project/lib/projectRoute.ts`：Project 查询参数的读写纯函数。
- `src/features/project/lib/projectTabs.ts`：多文件标签的去重打开与相邻关闭选择规则。
- `src/features/viewers/components/ContentViewerPanel.tsx`：消费 `FileViewerTarget`，复用 Workspace 文本、图片、PDF、HTML、音视频展示。
- `src/features/project/components/FileDiffView.tsx`：Project 与 Overview 复用的两侧文本 Diff。

## 数据与刷新

项目身份与会话复用现有 `/api/agent`、`/api/chats` 的 routedClient；文件浏览数据固定走 HTTP：

- `/api/project/tree` 单层懒加载目录，分页游标变化冲突时重载目录。
- `/api/project/changes` 读取当前 Chat 下按 Run 隔离的 file-history。
- `/api/project/diff` 一次读取原始与当前文本快照。
- `/api/file` 和 `response=content` 继续承担实时内容与媒体字节。

页面只在可见状态下每 5 秒刷新，并在窗口重新聚焦时立即刷新；刷新时只更新变更文件对应的已加载父目录、变更列表和命中的选中文件，不清空展开集合。离开页面或外部路由变化时主动取消旧的 tree/changes/diff HTTP 请求，中止信号与 generation 校验阻止迟到目录结果落入当前视图。

隐藏文件开关仅在 WebClient 内过滤目录项，名称以 `.` 开头的文件、目录和 symlink 都属于隐藏项；默认关闭。不新增 Platform 参数、接口或权限，也不修改原始目录数据。开关即时作用于所有已加载目录，保留展开状态、文件标签与当前预览。关闭时若一页全为隐藏项，继续使用原始 cursor 读取后续页，每批最多 5 页；到达上限仍保留“加载更多”，避免一次遍历整个大目录。原始隐藏项保留在缓存，重新打开开关即可显示。分页发生 409 冲突时从首批重载一次。

## 交互与边界

桌面端目录树默认 280px，可在 220–520px 之间拖动；小屏使用可展开侧栏。目录树支持名称过滤、隐藏文件开关、懒加载、分页、变更徽标与手动刷新。点击文件会追加到右侧多文件标签栏；标签支持切换和关闭，关闭当前标签后选择相邻文件。文件标签、MIME/大小、下载图标和“内容 / Diff”页签共用一行，项目名称、Chat/Run/刷新动作使用单行紧凑工具栏。

Project 文本 Viewer 固定显示行号；图片继续通过 `/api/file?response=content` 和现有鉴权资源链路显示。Project 不展示 Content Viewer 的通用说明，但保留真正发生截断时的提示。二进制、超限、无 Run 快照等 Diff 错误以明确空态展示，不回退为伪 Diff。

首版没有保存、创建、重命名、删除、Terminal、拖拽上传或 Git Diff。实时内容可以包含 Bash/ACP/外部程序产生的变化，但只有 Platform `file_write/file_edit` 的 Run 快照会出现在变更列表和 Diff。

## 验证

```bash
npm test -- --runInBand src/features/project src/features/viewers/components/ContentViewerPanel.test.ts src/shared/data/api/requests/projects.test.ts src/app/App.routing.test.ts
npm run build
```

手工回归需覆盖直接访问 `/project/:agentKey`、裸 `/project` 空态、Chat/Run 切换、无 Run 的目录与文件内容、浏览器前进后退、隐藏文件和嵌套隐藏目录开关、纯隐藏分页、媒体预览、Diff 必填身份、页面隐藏暂停刷新，以及外部路由变化后旧请求不再落入当前视图。页面内不提供项目切换入口。

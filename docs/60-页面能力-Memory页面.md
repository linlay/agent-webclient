# 记忆管理

侧栏设置菜单和记忆快捷入口统一在独立标签页打开 `/memory`，与 Skills Center、Connectors Center 等管理页保持一致。独立页面与保留的 Memory Modal 组件共用紧凑的文档工作台。Platform 是唯一读写事实源：OWNER.md 保存用户明确的资料与偏好，memory.md 保存长期事实，daily/YYYY-MM-DD.md 保存当日记录。页面不依赖当前 Agent，也不依赖已退役的 MEMORY_ENABLED 开关。

编辑状态局限在挂载页面；切换文件、关闭弹窗或路由离开时提示未保存修改。HTTP GET/PUT/DELETE `/api/memory/file` 使用固定 kind/date 和 revision；409 保留草稿，重新加载后由用户合并。日期与当天值由 Platform 时区计算；日期列表和文字检索按游标加载。知识索引由 KBX 承担。

旧 records、scope、context preview、数据库 DTO、全局记忆 reducer、/remember 和 /learn 命令已退役。Desktop 只提供侧栏入口和页面承载，不直接读写文件。

用户可以编辑、预览、保存和删除三类 Markdown；删除记忆不自动删除原始 Chat 历史。保存后后续 Run 读取新版内容，活动 Run 的上下文快照保持稳定。

界面默认显示 Markdown 预览，左侧统一放置长期记忆、身份与偏好、每日日期和全文检索，右侧工具栏切换预览或编辑并提供重新加载、保存。弹窗只保留一处标题，正文独立滚动，底部显示草稿状态、行数和字符数；记录原则默认折叠，删除入口置于底部。窄屏布局转为上下排列。

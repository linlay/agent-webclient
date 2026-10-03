# 记忆与资料

`/memory` 和全局 Memory Modal 共用文件编辑器。Platform 是唯一读写事实源：OWNER.md 保存用户明确的资料与偏好，memory.md 保存长期事实，daily/YYYY-MM-DD.md 保存当日记录。页面不依赖当前 Agent，也不依赖已退役的 MEMORY_ENABLED 开关。

编辑状态局限在挂载页面；切换文件、关闭弹窗或路由离开时提示未保存修改。HTTP GET/PUT/DELETE `/api/memory/file` 使用固定 kind/date 和 revision；409 保留草稿，重新加载后由用户合并。日期与当天值由 Platform 时区计算；日期列表和文字检索按游标加载。知识索引由 KBX 承担。

旧 records、scope、context preview、数据库 DTO、全局记忆 reducer、/remember 和 /learn 命令已退役。Desktop 只提供侧栏入口和页面承载，不直接读写文件。

用户可以编辑、预览、保存和删除三类 Markdown；删除记忆不自动删除原始 Chat 历史。保存后后续 Run 读取新版内容，活动 Run 的上下文快照保持稳定。

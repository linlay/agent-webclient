export type ConversationExportLocale = "zh-CN" | "en-US";

export const conversationExportMessages = {
  "zh-CN": {
    toolLabels: {
      "desktop_shell": "桌面导航",
      "desktop_settings": "桌面设置",
      "desktop_site": "网站管理",
      "desktop_webapp": "应用管理",
      "desktop_service": "服务管理",
      "desktop_market": "功能市场",
      "desktop_kanban": "看板管理",
      "catalog_query": "查询目录",
      "catalog_manage": "管理目录",
      "chat_query": "查询会话",
      "chat_manage": "管理会话",
      "platform_inspect": "平台诊断"
},
    aiNotice: "内容由 AI 生成，请核实重要信息",
    assistant: "助手",
    copyAction: "复制对话",
    copyCopied: "已复制",
    copyFailed: "复制失败",
    diagramLoading: "图表加载中…",
    diagramUnavailable: "图表不可用，已显示源码",
    exportedAt: "快照时间",
    failure: "无法读取此对话快照。文件可能不完整或已损坏。",
    imageOmitted: "图片已从安全快照中省略",
    outcome: {
      running: "生成中（快照不会继续更新）",
      completed: "已完成",
      cancelled: "已取消",
      failed: "生成失败",
    },
    reasoning: "思考过程",
    turnDuration: "本轮耗时 {duration}",
    readOnly: "此页面为只读对话快照",
    snapshotBadge: "对话快照",
    snapshotNotice: "此文件保存导出时的对话快照，后续消息不会自动更新。",
    untitledReasoning: "思考",
    user: "用户",
  },
  "en-US": {
    toolLabels: {
      "desktop_shell": "Desktop navigation",
      "desktop_settings": "Desktop settings",
      "desktop_site": "Websites",
      "desktop_webapp": "WebApps",
      "desktop_service": "Services",
      "desktop_market": "Marketplace",
      "desktop_kanban": "Kanban",
      "catalog_query": "Query catalog",
      "catalog_manage": "Manage catalog",
      "chat_query": "Query conversations",
      "chat_manage": "Manage conversations",
      "platform_inspect": "Platform diagnostics"
},
    aiNotice: "AI-generated content may contain mistakes. Verify important information.",
    assistant: "Assistant",
    copyAction: "Copy conversation",
    copyCopied: "Copied",
    copyFailed: "Copy failed",
    diagramLoading: "Loading diagram…",
    diagramUnavailable: "Diagram unavailable; showing source",
    exportedAt: "Snapshot time",
    failure: "This conversation snapshot is incomplete or damaged.",
    imageOmitted: "Image omitted from the safe snapshot",
    outcome: {
      running: "Running (this snapshot will not update)",
      completed: "Completed",
      cancelled: "Cancelled",
      failed: "Failed",
    },
    reasoning: "Reasoning",
    turnDuration: "Turn duration {duration}",
    readOnly: "This page is a read-only conversation snapshot",
    snapshotBadge: "Conversation snapshot",
    snapshotNotice:
      "This file is a snapshot. Later messages will not update it.",
    untitledReasoning: "Reasoning",
    user: "User",
  },
} as const;

export function resolveConversationExportLocale(): ConversationExportLocale {
  return typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en-US";
}

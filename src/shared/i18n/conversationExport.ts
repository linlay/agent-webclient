export type ConversationExportLocale = "zh-CN" | "en-US";

export const conversationExportMessages = {
  "zh-CN": {
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
    reasoningCompleted: "已完成 {duration}",
    reasoningCompletedWithoutDuration: "已完成",
    reasoningSnapshot: "思考过程快照",
    readOnly: "此页面为只读对话快照",
    snapshotBadge: "对话快照",
    snapshotNotice: "此文件保存导出时的对话快照，后续消息不会自动更新。",
    untitledReasoning: "思考",
    user: "用户",
  },
  "en-US": {
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
    reasoningCompleted: "Completed in {duration}",
    reasoningCompletedWithoutDuration: "Completed",
    reasoningSnapshot: "Reasoning snapshot",
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

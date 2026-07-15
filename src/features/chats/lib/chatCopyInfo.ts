import type { ChatDetailResponse, ChatUsageData } from "@/shared/data";
import {
  compactCopyInfoRows,
  createCopyInfoRow,
  type CopyInfoGroup,
} from "@/shared/ui/copyInfoModel";

export interface ChatCopySummary {
  chatId: string;
  chatName?: string;
}

type CopyInfoTranslator = (
  key: string,
  params?: Record<string, unknown>,
) => string;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function resolveChatUsage(usage: ChatUsageData | undefined): ChatUsageData | undefined {
  return usage?.chat || usage;
}

export function buildChatCopyInfoGroups(input: {
  summary: ChatCopySummary;
  detail?: Partial<ChatDetailResponse> | null;
  t: CopyInfoTranslator;
}): CopyInfoGroup[] {
  const { summary, detail = null, t } = input;
  const activeRun = objectValue(detail?.activeRun);
  const usage = resolveChatUsage(detail?.usage);
  const createdAt = detail?.createdAt;
  const updatedAt = detail?.updatedAt;

  return [
    {
      key: "basic",
      label: t("copyInfo.group.basic"),
      rows: compactCopyInfoRows([
        createCopyInfoRow("id", t("chatCopy.field.id"), detail?.chatId || summary.chatId),
        createCopyInfoRow("name", t("chatCopy.field.name"), detail?.chatName || summary.chatName),
        createCopyInfoRow("agentKey", t("chatCopy.field.agentKey"), detail?.agentKey),
        createCopyInfoRow("firstAgentKey", t("chatCopy.field.firstAgentKey"), detail?.firstAgentKey),
        createCopyInfoRow("firstAgentName", t("chatCopy.field.firstAgentName"), detail?.firstAgentName),
        createCopyInfoRow("teamId", t("chatCopy.field.teamId"), detail?.teamId),
        createCopyInfoRow("source", t("chatCopy.field.source"), detail?.source),
        createCopyInfoRow("createdAt", t("chatCopy.field.createdAt"), createdAt, {
          displayValue: formatTimestamp(createdAt),
          copyValue: createdAt === undefined ? undefined : String(createdAt),
        }),
        createCopyInfoRow("updatedAt", t("chatCopy.field.updatedAt"), updatedAt, {
          displayValue: formatTimestamp(updatedAt),
          copyValue: updatedAt === undefined ? undefined : String(updatedAt),
        }),
        createCopyInfoRow("lastRunId", t("chatCopy.field.lastRunId"), detail?.lastRunId),
        createCopyInfoRow("lastRunContent", t("chatCopy.field.lastRunContent"), detail?.lastRunContent),
      ]),
    },
    {
      key: "runtime",
      label: t("copyInfo.group.runtime"),
      rows: compactCopyInfoRows([
        createCopyInfoRow("activeRunId", t("chatCopy.field.activeRunId"), activeRun?.runId),
        createCopyInfoRow("activeRunAgent", t("chatCopy.field.activeRunAgent"), activeRun?.agentKey),
        createCopyInfoRow("activeRunStatus", t("chatCopy.field.activeRunStatus"), activeRun?.status),
        createCopyInfoRow("model", t("chatCopy.field.model"), usage?.modelKey),
        createCopyInfoRow("promptTokens", t("chatCopy.field.promptTokens"), usage?.promptTokens),
        createCopyInfoRow("completionTokens", t("chatCopy.field.completionTokens"), usage?.completionTokens),
        createCopyInfoRow("totalTokens", t("chatCopy.field.totalTokens"), usage?.totalTokens),
        createCopyInfoRow("toolCallCount", t("chatCopy.field.toolCallCount"), usage?.toolCallCount),
        createCopyInfoRow("llmCallCount", t("chatCopy.field.llmCallCount"), usage?.llmChatCompletionCount),
        createCopyInfoRow("estimatedCost", t("chatCopy.field.estimatedCost"), usage?.estimatedCost),
      ]),
    },
    {
      key: "advanced",
      label: t("copyInfo.group.advanced"),
      collapsed: true,
      rows: compactCopyInfoRows([
        createCopyInfoRow("activeRun", t("chatCopy.field.activeRun"), detail?.activeRun),
        createCopyInfoRow("usage", t("chatCopy.field.usage"), detail?.usage),
        createCopyInfoRow("plan", t("chatCopy.field.plan"), detail?.plan),
        createCopyInfoRow("artifact", t("chatCopy.field.artifact"), detail?.artifact),
        createCopyInfoRow("runs", t("chatCopy.field.runs"), detail?.runs),
      ]),
    },
  ];
}

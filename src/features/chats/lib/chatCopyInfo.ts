import type { ChatDetailResponse } from "@/shared/data";
import {
  compactCopyInfoRows,
  createCopyInfoRow,
  type CopyInfoGroup,
} from "@/shared/ui/copyInfoModel";

export interface ChatCopySummary {
  chatId: string;
  chatName?: string;
  agentKey?: string;
}

type CopyInfoTranslator = (
  key: string,
  params?: Record<string, unknown>,
) => string;

function formatTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function buildChatCopyInfoGroups(input: {
  summary: ChatCopySummary;
  detail?: Partial<ChatDetailResponse> | null;
  t: CopyInfoTranslator;
}): CopyInfoGroup[] {
  const { summary, detail = null, t } = input;
  const createdAt = detail?.createdAt;
  const updatedAt = detail?.updatedAt;

  return [
    {
      key: "basic",
      label: t("copyInfo.group.basic"),
      rows: compactCopyInfoRows([
        createCopyInfoRow("id", t("chatCopy.field.id"), detail?.chatId || summary.chatId),
        createCopyInfoRow("name", t("chatCopy.field.name"), detail?.chatName || summary.chatName),
        createCopyInfoRow("agentKey", t("chatCopy.field.agentKey"), detail?.agentKey || summary.agentKey),
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
  ];
}

import type { ConversationSnapshotV1 } from "./conversationSnapshot";
import {
  conversationExportMessages,
  type ConversationExportLocale,
} from "@/shared/i18n/conversationExport";

export function buildConversationCopyText(
  snapshot: ConversationSnapshotV1,
  locale: ConversationExportLocale,
): string {
  const copy = conversationExportMessages[locale];
  return snapshot.turns
    .flatMap((turn) => turn.items)
    .map((item) => [
      item.kind === "reasoning"
        ? item.label || copy.reasoning
        : item.kind === "user"
          ? copy.user
          : copy.assistant,
      item.text,
    ].join("\n\n"))
    .join("\n\n---\n\n");
}

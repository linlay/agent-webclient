import type {
  SharedConversationEntry,
  SharedConversationMessageEntry,
  SharedConversationReasoningEntry,
} from "@/shared/data/conversationShare";

export type TranscriptGroup =
  | { type: "user"; entry: SharedConversationMessageEntry; sourceIndex: number }
  | {
      type: "assistant";
      traceEntries: Array<
        SharedConversationReasoningEntry | SharedConversationMessageEntry
      >;
      responseEntries: SharedConversationMessageEntry[];
      durationMs?: number;
      sourceIndex: number;
    };

export function groupTranscriptEntries(
  entries: SharedConversationEntry[],
): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];
  let assistantEntries: Array<
    SharedConversationReasoningEntry | SharedConversationMessageEntry
  > = [];
  let assistantSourceIndex = -1;
  let assistantDurationMs: number | undefined;

  const flushAssistant = (): void => {
    if (assistantEntries.length === 0) return;

    const hasReasoning = assistantEntries.some(
      (entry) => entry.type === "reasoning",
    );
    const lastEntry = assistantEntries.at(-1);
    const finalResponseEntry = hasReasoning && lastEntry?.type === "message"
      ? lastEntry
      : null;
    const traceEntries = hasReasoning
      ? finalResponseEntry
        ? assistantEntries.slice(0, -1)
        : assistantEntries
      : [];
    const responseEntries = hasReasoning
      ? finalResponseEntry
        ? [finalResponseEntry]
        : []
      : assistantEntries.filter(
          (entry): entry is SharedConversationMessageEntry =>
            entry.type === "message",
        );

    groups.push({
      type: "assistant",
      traceEntries,
      responseEntries,
      ...(assistantDurationMs === undefined
        ? {}
        : { durationMs: assistantDurationMs }),
      sourceIndex: assistantSourceIndex,
    });
    assistantEntries = [];
    assistantSourceIndex = -1;
    assistantDurationMs = undefined;
  };

  for (const [index, entry] of entries.entries()) {
    if (entry.type === "message" && entry.role === "user") {
      flushAssistant();
      groups.push({ type: "user", entry, sourceIndex: index });
      continue;
    }

    if (assistantEntries.length === 0) {
      assistantSourceIndex = index;
    }
    assistantEntries.push(entry);
    if (entry.type === "reasoning" && entry.durationMs !== undefined) {
      assistantDurationMs = entry.durationMs;
    }
  }
  flushAssistant();

  return groups;
}

export function formatSharedDuration(durationMs: number): string {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) return `${durationMs}ms`;

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m${seconds}s`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes}m`;
}

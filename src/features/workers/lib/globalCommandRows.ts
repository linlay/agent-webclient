import type {
  Agent,
  Chat,
  Team,
  WorkerConversationRow,
  WorkerRow,
} from "@/app/state/types";
import {
  isChatUnread,
  normalizeChatReadState,
} from "@/features/chats/lib/chatReadState";
import type { MaterialIconName } from "@/shared/icons/material";

export type GlobalCommandSection =
  | "awaiting"
  | "unread"
  | "actions"
  | "workers"
  | "history";

export type GlobalRow =
  | {
      kind: "action";
      section: "actions";
      key: string;
      label: string;
      icon: MaterialIconName;
      action: string;
    }
  | {
      kind: "worker";
      section: "workers";
      key: string;
      label: string;
      role: string;
      type: "agent" | "team";
      icon?: Agent["icon"] | Team["icon"];
    }
  | {
      kind: "history";
      section: "awaiting" | "unread" | "history";
      key: string;
      chatId: string;
      label: string;
      snippet?: string;
      sourceLabel?: string;
      awaitingMode?: string;
      isUnread?: boolean;
    };

export interface BuildGlobalRowsInput {
  agents?: Agent[];
  workerRows: WorkerRow[];
  chats?: Chat[];
  historyRows?: WorkerConversationRow[] | null;
  searchText: string;
  hasCurrentWorker: boolean;
  workerIcons?: ReadonlyMap<string, Agent["icon"] | Team["icon"]>;
  t: (key: string, params?: Record<string, unknown>) => string;
}

const AWAITING_LIMIT = 5;
const UNREAD_LIMIT = 5;
const WORKER_LIMIT = 20;
const HISTORY_LIMIT = 10;

function normalizeUpdatedAt(updatedAt: unknown): number {
  const numeric = Number(updatedAt);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function compareHistoryFreshness(
  a: Pick<WorkerConversationRow, "chatId" | "updatedAt">,
  b: Pick<WorkerConversationRow, "chatId" | "updatedAt">,
): number {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  return a.chatId.localeCompare(b.chatId);
}

function buildWorkerLabelByKey(workerRows: WorkerRow[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const worker of Array.isArray(workerRows) ? workerRows : []) {
    if (!worker.key) continue;
    labels.set(worker.key, worker.displayName || worker.sourceId || worker.key);
  }
  return labels;
}

function resolveHistorySourceLabel(
  row: Pick<WorkerConversationRow, "agentKey" | "teamId">,
  workerLabelByKey: ReadonlyMap<string, string>,
): string {
  const explicitSourceLabel = toText(
    (row as Pick<WorkerConversationRow, "agentKey" | "teamId"> & {
      sourceLabel?: unknown;
    }).sourceLabel,
  );
  if (explicitSourceLabel) return explicitSourceLabel;

  const teamId = toText(row.teamId);
  if (teamId) {
    return workerLabelByKey.get(`team:${teamId}`) || teamId;
  }

  const agentKey = toText(row.agentKey);
  if (agentKey) {
    return workerLabelByKey.get(`agent:${agentKey}`) || agentKey;
  }

  return "";
}

function buildAgentScopedHistoryRows(
  agents: Agent[] | undefined,
): WorkerConversationRow[] {
  const rows: Array<WorkerConversationRow & { sourceLabel?: string }> = [];
  for (const agent of Array.isArray(agents) ? agents : []) {
    const agentKey = toText(agent?.key);
    if (!agentKey) continue;

    const sourceLabel = toText(agent?.name) || agentKey;
    const agentChats = Array.isArray(agent?.chats) ? agent.chats : [];
    const scopedRows: Array<WorkerConversationRow & { sourceLabel?: string }> = [];
    for (const rawChat of agentChats) {
      if (!rawChat || typeof rawChat !== "object") continue;
      const chat = rawChat as Chat;
      const chatId = toText(chat?.chatId);
      if (!chatId) continue;

      const read = normalizeChatReadState(chat?.read);
      scopedRows.push({
        chatId,
        chatName: toText(chat?.chatName) || chatId,
        agentKey: toText(chat?.agentKey || chat?.firstAgentKey) || agentKey,
        teamId: toText(chat?.teamId) || undefined,
        updatedAt: normalizeUpdatedAt(chat?.updatedAt),
        lastRunId: toText(chat?.lastRunId),
        lastRunContent: toText(chat?.lastRunContent),
        read,
        isRead: read?.isRead ?? true,
        hasPendingAwaiting: Object.prototype.hasOwnProperty.call(
          chat,
          "hasPendingAwaiting",
        )
          ? Boolean(chat?.hasPendingAwaiting)
          : Boolean(chat?.awaiting),
        awaitingMode: chat?.awaiting?.mode,
        searchSnippet: toText(chat?.lastRunContent),
        sourceLabel,
      });
    }
    scopedRows.sort(compareHistoryFreshness);
    rows.push(...scopedRows);
  }
  return rows;
}

function buildGlobalHistoryRows(
  chats: Chat[] | undefined,
  workerLabelByKey: ReadonlyMap<string, string>,
): WorkerConversationRow[] {
  return (Array.isArray(chats) ? chats : [])
    .map((chat) => {
      const read = normalizeChatReadState(chat?.read);
      const agentKey = toText(chat?.agentKey || chat?.firstAgentKey);
      const teamId = toText(chat?.teamId);
      return {
        chatId: toText(chat?.chatId),
        chatName: toText(chat?.chatName) || toText(chat?.chatId),
        agentKey: agentKey || undefined,
        teamId: teamId || undefined,
        updatedAt: normalizeUpdatedAt(chat?.updatedAt),
        lastRunId: toText(chat?.lastRunId),
        lastRunContent: toText(chat?.lastRunContent),
        read,
        isRead: read?.isRead ?? true,
        hasPendingAwaiting: Boolean(chat?.hasPendingAwaiting),
        awaitingMode: chat?.awaiting?.mode,
        searchSnippet: toText(chat?.lastRunContent),
      } satisfies WorkerConversationRow;
    })
    .filter((row) => row.chatId)
    .sort(compareHistoryFreshness)
    .map((row) => ({
      ...row,
      searchSnippet:
        row.searchSnippet ||
        resolveHistorySourceLabel(row, workerLabelByKey) ||
        undefined,
    }));
}

function selectPerAgentHistoryRows(
  rows: WorkerConversationRow[],
  limit: number,
  predicate: (row: WorkerConversationRow) => boolean,
): WorkerConversationRow[] {
  const selected: WorkerConversationRow[] = [];
  const countsByAgentKey = new Map<string, number>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    const agentKey = toText(row.agentKey) || "unknown";
    const currentCount = countsByAgentKey.get(agentKey) || 0;
    if (currentCount >= limit) continue;
    countsByAgentKey.set(agentKey, currentCount + 1);
    selected.push(row);
  }
  return selected;
}

function historyMatchesSearch(
  row: WorkerConversationRow,
  sourceLabel: string,
  normalizedSearch: string,
): boolean {
  if (!normalizedSearch) return true;
  return [row.chatName, row.chatId, row.lastRunContent, sourceLabel]
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

function toHistoryRow(
  row: WorkerConversationRow,
  section: "awaiting" | "unread" | "history",
  sourceLabel: string,
): GlobalRow {
  return {
    kind: "history",
    section,
    key: `${section}:${row.chatId}`,
    chatId: row.chatId,
    label: row.chatName || row.chatId || "",
    snippet: row.lastRunContent || row.searchSnippet || undefined,
    sourceLabel,
    awaitingMode: row.awaitingMode,
    isUnread: isChatUnread(row),
  };
}

export function buildGlobalRows(input: BuildGlobalRowsInput): GlobalRow[] {
  const { agents, workerRows, chats, historyRows, searchText, hasCurrentWorker, workerIcons, t } =
    input;
  const normalizedSearch = searchText.toLowerCase().trim();
  const workerLabelByKey = buildWorkerLabelByKey(workerRows);
  const localHistoryRows = buildGlobalHistoryRows(chats, workerLabelByKey);
  const defaultAttentionRows = buildAgentScopedHistoryRows(agents);
  const searchableHistoryRows = historyRows ?? localHistoryRows;
  const rows: GlobalRow[] = [];

  if (!normalizedSearch) {
    const awaitingRows = selectPerAgentHistoryRows(
      defaultAttentionRows,
      AWAITING_LIMIT,
      (row) => Boolean(row.hasPendingAwaiting),
    );
    for (const row of awaitingRows) {
      rows.push(
        toHistoryRow(
          row,
          "awaiting",
          resolveHistorySourceLabel(row, workerLabelByKey),
        ),
      );
    }

    const unreadRows = selectPerAgentHistoryRows(
      defaultAttentionRows,
      UNREAD_LIMIT,
      (row) => isChatUnread(row) && !row.hasPendingAwaiting,
    );
    for (const row of unreadRows) {
      rows.push(
        toHistoryRow(
          row,
          "unread",
          resolveHistorySourceLabel(row, workerLabelByKey),
        ),
      );
    }
  }

  /* Actions section */
  const actions: GlobalRow[] = [];
  if (hasCurrentWorker) {
    actions.push({
      kind: "action",
      section: "actions",
      key: "newConversation",
      label: t("commandModal.global.action.newConversation"),
      icon: "edit_square",
      action: "newConversation",
    });
    actions.push({
      kind: "action",
      section: "actions",
      key: "history",
      label: t("commandModal.global.action.history"),
      icon: "history",
      action: "history",
    });
  }
  actions.push(
    {
      kind: "action",
      section: "actions",
      key: "switch",
      label: t("commandModal.global.action.switch"),
      icon: "swap_horiz",
      action: "switch",
    },
    {
      kind: "action",
      section: "actions",
      key: "settings",
      label: t("commandModal.global.action.settings"),
      icon: "settings",
      action: "settings",
    },
    {
      kind: "action",
      section: "actions",
      key: "debug",
      label: t("commandModal.global.action.debug"),
      icon: "bug_report",
      action: "debug",
    },
  );

  if (!normalizedSearch) {
    rows.push(...actions);
  } else {
    const filteredActions = actions.filter((a) =>
      a.label.toLowerCase().includes(normalizedSearch),
    );
    rows.push(...filteredActions);
  }

  /* Workers/teams section */
  const filteredWorkers = workerRows
    .filter((row) => {
      if (!normalizedSearch) return true;
      return (row.searchText || row.displayName || "")
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .slice(0, WORKER_LIMIT);
  for (const w of filteredWorkers) {
    rows.push({
      kind: "worker",
      section: "workers",
      key: w.key,
      label: w.displayName,
      role: w.role || "--",
      type: w.type as "agent" | "team",
      icon: workerIcons?.get(w.key),
    });
  }

  /* Chat search section */
  if (normalizedSearch) {
    const filteredHistory = searchableHistoryRows
      .filter((row) => {
        const sourceLabel = resolveHistorySourceLabel(row, workerLabelByKey);
        return historyMatchesSearch(row, sourceLabel, normalizedSearch);
      })
      .slice(0, HISTORY_LIMIT);
    for (const h of filteredHistory) {
      rows.push(
        toHistoryRow(
          h,
          "history",
          resolveHistorySourceLabel(h, workerLabelByKey),
        ),
      );
    }
  }

  return rows;
}

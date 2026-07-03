import type {
  Agent,
  Chat,
  Team,
  WorkerConversationRow,
  WorkerRow,
} from "@/app/state/types";
import { isChatActiveRun } from "@/features/chats/lib/chatRunState";
import {
  isChatUnread,
  normalizeChatReadState,
} from "@/features/chats/lib/chatReadState";
import { resolveConversationDisplayTitle } from "@/features/chats/lib/chatListFormatter";
import type { MaterialIconName } from "@/shared/icons/material";
import { toText } from "@/shared/utils/eventUtils";
import { readEpochMillis } from "@/shared/utils/platformTime";

export type GlobalRowSection =
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
      updatedAt: number;
      isUnread: boolean;
      hasPendingAwaiting: boolean;
      statusLabel?: string;
      hasActiveRun: boolean;
    };

export interface BuildGlobalRowsInput {
  agents?: Agent[];
  chats?: Chat[];
  workerRows: WorkerRow[];
  historyRows?: WorkerConversationRow[] | null;
  searchText: string;
  hasCurrentWorker: boolean;
  workerIcons?: ReadonlyMap<string, Agent["icon"] | Team["icon"]>;
  t: (key: string, params?: Record<string, unknown>) => string;
}

type ConversationCandidate = {
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
  updatedAt: number;
  lastRunId: string;
  lastRunContent: string;
  searchSnippet?: string;
  isRead: boolean;
  hasPendingAwaiting: boolean;
  awaitingMode?: string;
  hasActiveRun: boolean;
};

const ATTENTION_LIMIT_PER_AGENT = 5;
const WORKER_RESULT_LIMIT = 20;
const HISTORY_RESULT_LIMIT = 10;

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case "plan":
      return "leftSidebar.awaitingStatus.plan";
    case "question":
      return "leftSidebar.awaitingStatus.question";
    case "approval":
      return "leftSidebar.awaitingStatus.approval";
    case "form":
      return "leftSidebar.awaitingStatus.form";
    default:
      return "leftSidebar.awaitingApproval";
  }
}

function readAgentKey(chat: Partial<Chat> | null | undefined): string {
  return toText(chat?.agentKey || chat?.firstAgentKey);
}

function readAwaitingMode(chat: Partial<Chat> | null | undefined): string | undefined {
  const awaiting = chat?.awaiting;
  if (!awaiting || typeof awaiting !== "object" || Array.isArray(awaiting)) {
    return undefined;
  }
  return toText((awaiting as { mode?: unknown }).mode) || undefined;
}

function isAwaitingChat(chat: Partial<Chat> | null | undefined): boolean {
  return Boolean(chat && (chat.hasPendingAwaiting === true || chat.awaiting));
}

function compareConversationFreshness(
  a: Pick<ConversationCandidate, "updatedAt" | "chatId">,
  b: Pick<ConversationCandidate, "updatedAt" | "chatId">,
): number {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  return a.chatId.localeCompare(b.chatId);
}

function createAgentOrderByKey(agents: Agent[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const agent of Array.isArray(agents) ? agents : []) {
    const key = toText(agent?.key);
    if (!key || order.has(key)) continue;
    order.set(key, order.size);
  }
  return order;
}

function compareAgentKeys(
  a: string,
  b: string,
  agentOrderByKey: ReadonlyMap<string, number>,
): number {
  const orderA = agentOrderByKey.get(a);
  const orderB = agentOrderByKey.get(b);
  const hasOrderA = orderA !== undefined;
  const hasOrderB = orderB !== undefined;
  if (hasOrderA && hasOrderB) return orderA - orderB;
  if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;
  return a.localeCompare(b);
}

function buildAgentLabelByKey(
  agents: Agent[],
  workerRows: WorkerRow[],
): Map<string, string> {
  const labelByKey = new Map<string, string>();
  for (const agent of Array.isArray(agents) ? agents : []) {
    const key = toText(agent?.key);
    if (!key) continue;
    labelByKey.set(key, toText(agent?.name) || key);
  }
  for (const worker of Array.isArray(workerRows) ? workerRows : []) {
    if (worker.type !== "agent") continue;
    const key = toText(worker.sourceId);
    if (!key) continue;
    labelByKey.set(key, toText(worker.displayName) || labelByKey.get(key) || key);
  }
  return labelByKey;
}

function buildTeamLabelByKey(workerRows: WorkerRow[]): Map<string, string> {
  const labelByKey = new Map<string, string>();
  for (const worker of Array.isArray(workerRows) ? workerRows : []) {
    if (worker.type !== "team") continue;
    const key = toText(worker.sourceId);
    if (!key) continue;
    labelByKey.set(key, toText(worker.displayName) || key);
  }
  return labelByKey;
}

function resolveSourceLabel(
  row: Pick<ConversationCandidate, "agentKey" | "teamId">,
  agentLabelByKey: ReadonlyMap<string, string>,
  teamLabelByKey: ReadonlyMap<string, string>,
): string | undefined {
  const agentKey = toText(row.agentKey);
  if (agentKey) return agentLabelByKey.get(agentKey) || agentKey;
  const teamId = toText(row.teamId);
  if (teamId) return teamLabelByKey.get(teamId) || teamId;
  return undefined;
}

function chatToCandidate(chat: Chat): ConversationCandidate | null {
  const chatId = toText(chat?.chatId);
  if (!chatId) return null;
  const read = normalizeChatReadState(chat?.read);
  return {
    chatId,
    chatName: toText(chat?.chatName),
    agentKey: readAgentKey(chat) || undefined,
    teamId: toText(chat?.teamId) || undefined,
    updatedAt: readEpochMillis(chat?.updatedAt),
    lastRunId: toText(chat?.lastRunId),
    lastRunContent: toText(chat?.lastRunContent),
    isRead: read?.isRead ?? true,
    hasPendingAwaiting: isAwaitingChat(chat),
    awaitingMode: readAwaitingMode(chat),
    hasActiveRun: isChatActiveRun(chat),
  };
}

function historyRowToCandidate(row: WorkerConversationRow): ConversationCandidate | null {
  const chatId = toText(row?.chatId);
  if (!chatId) return null;
  return {
    chatId,
    chatName: toText(row?.chatName),
    agentKey: toText(row?.agentKey) || undefined,
    teamId: toText(row?.teamId) || undefined,
    updatedAt: readEpochMillis(row?.updatedAt),
    lastRunId: toText(row?.lastRunId),
    lastRunContent: toText(row?.lastRunContent),
    searchSnippet: toText(row?.searchSnippet) || undefined,
    isRead: row?.isRead ?? row?.read?.isRead ?? true,
    hasPendingAwaiting: Boolean(row?.hasPendingAwaiting),
    awaitingMode: toText(row?.awaitingMode) || undefined,
    hasActiveRun: Boolean(row?.hasActiveRun),
  };
}

function toHistoryRow(input: {
  candidate: ConversationCandidate;
  section: "awaiting" | "unread" | "history";
  sourceLabel?: string;
  t: BuildGlobalRowsInput["t"];
}): Extract<GlobalRow, { kind: "history" }> {
  const { candidate, section, sourceLabel, t } = input;
  return {
    kind: "history",
    section,
    key: `${section}:${candidate.chatId}`,
    chatId: candidate.chatId,
    label: resolveConversationDisplayTitle(
      candidate,
      t("leftSidebar.titleUntitled"),
    ),
    snippet: candidate.searchSnippet || candidate.lastRunContent || undefined,
    sourceLabel,
    updatedAt: candidate.updatedAt,
    isUnread: candidate.isRead === false,
    hasPendingAwaiting: candidate.hasPendingAwaiting,
    statusLabel: candidate.hasPendingAwaiting
      ? t(getAwaitingStatusKey(candidate.awaitingMode))
      : undefined,
    hasActiveRun: candidate.hasActiveRun,
  };
}

function buildAttentionRows(input: {
  section: "awaiting" | "unread";
  chats: Chat[];
  agents: Agent[];
  workerRows: WorkerRow[];
  awaitingChatIds: ReadonlySet<string>;
  t: BuildGlobalRowsInput["t"];
}): GlobalRow[] {
  const agentOrderByKey = createAgentOrderByKey(input.agents);
  const agentLabelByKey = buildAgentLabelByKey(input.agents, input.workerRows);
  const teamLabelByKey = buildTeamLabelByKey(input.workerRows);
  const grouped = new Map<string, ConversationCandidate[]>();
  const seenChatIds = new Set<string>();

  for (const chat of Array.isArray(input.chats) ? input.chats : []) {
    const candidate = chatToCandidate(chat);
    if (!candidate) continue;
    const agentKey = toText(candidate.agentKey);
    if (!agentKey) continue;
    if (seenChatIds.has(candidate.chatId)) continue;
    const isAwaiting = input.awaitingChatIds.has(candidate.chatId);
    if (input.section === "awaiting" && !isAwaiting) continue;
    if (input.section === "unread" && (isAwaiting || !isChatUnread(chat))) continue;

    seenChatIds.add(candidate.chatId);
    const bucket = grouped.get(agentKey) || [];
    bucket.push(candidate);
    grouped.set(agentKey, bucket);
  }

  const rows: GlobalRow[] = [];
  const agentKeys = Array.from(grouped.keys()).sort((a, b) =>
    compareAgentKeys(a, b, agentOrderByKey),
  );
  for (const agentKey of agentKeys) {
    const candidates = (grouped.get(agentKey) || [])
      .slice()
      .sort(compareConversationFreshness)
      .slice(0, ATTENTION_LIMIT_PER_AGENT);
    for (const candidate of candidates) {
      rows.push(
        toHistoryRow({
          candidate,
          section: input.section,
          sourceLabel: resolveSourceLabel(candidate, agentLabelByKey, teamLabelByKey),
          t: input.t,
        }),
      );
    }
  }
  return rows;
}

function buildActions(input: BuildGlobalRowsInput): GlobalRow[] {
  const actions: GlobalRow[] = [];
  if (input.hasCurrentWorker) {
    actions.push({
      kind: "action",
      section: "actions",
      key: "newConversation",
      label: input.t("globalSearch.action.newConversation"),
      icon: "edit_square",
      action: "newConversation",
    });
    actions.push({
      kind: "action",
      section: "actions",
      key: "history",
      label: input.t("globalSearch.action.history"),
      icon: "history",
      action: "history",
    });
  }
  actions.push(
    {
      kind: "action",
      section: "actions",
      key: "switch",
      label: input.t("globalSearch.action.switch"),
      icon: "swap_horiz",
      action: "switch",
    },
    {
      kind: "action",
      section: "actions",
      key: "settings",
      label: input.t("globalSearch.action.settings"),
      icon: "settings",
      action: "settings",
    },
    {
      kind: "action",
      section: "actions",
      key: "debug",
      label: input.t("globalSearch.action.debug"),
      icon: "bug_report",
      action: "debug",
    },
  );
  return actions;
}

function buildWorkers(input: BuildGlobalRowsInput, normalizedSearch: string): GlobalRow[] {
  return input.workerRows
    .filter((row) => {
      if (!normalizedSearch) return true;
      return (row.searchText || row.displayName || "")
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .slice(0, WORKER_RESULT_LIMIT)
    .map((worker) => ({
      kind: "worker",
      section: "workers",
      key: worker.key,
      label: worker.displayName,
      role: worker.role,
      type: worker.type as "agent" | "team",
      icon: input.workerIcons?.get(worker.key),
    }));
}

function buildSearchHistoryRows(
  input: BuildGlobalRowsInput,
  normalizedSearch: string,
): GlobalRow[] {
  if (!normalizedSearch) return [];

  const agentLabelByKey = buildAgentLabelByKey(input.agents || [], input.workerRows);
  const teamLabelByKey = buildTeamLabelByKey(input.workerRows);
  const historyRows = input.historyRows;
  const hasRemoteHistoryRows = Array.isArray(historyRows);
  const candidates = hasRemoteHistoryRows
    ? historyRows
        .map(historyRowToCandidate)
        .filter((row): row is ConversationCandidate => Boolean(row))
    : (input.chats || [])
        .map(chatToCandidate)
        .filter((row): row is ConversationCandidate => Boolean(row));

  const filteredCandidates = candidates.filter((row) => {
    const haystack = [
      row.chatName,
      row.chatId,
      row.lastRunContent,
      row.searchSnippet,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const orderedCandidates = hasRemoteHistoryRows
    ? filteredCandidates
    : filteredCandidates.slice().sort(compareConversationFreshness);

  return orderedCandidates
    .slice(0, HISTORY_RESULT_LIMIT)
    .map((candidate) =>
      toHistoryRow({
        candidate,
        section: "history",
        sourceLabel: resolveSourceLabel(candidate, agentLabelByKey, teamLabelByKey),
        t: input.t,
      }),
    );
}

export function buildGlobalRows(input: BuildGlobalRowsInput): GlobalRow[] {
  const normalizedSearch = input.searchText.toLowerCase().trim();
  const rows: GlobalRow[] = [];
  const chats = input.chats || [];
  const agents = input.agents || [];

  if (!normalizedSearch) {
    const awaitingChatIds = new Set(
      chats
        .filter(isAwaitingChat)
        .map((chat) => toText(chat?.chatId))
        .filter(Boolean),
    );
    rows.push(
      ...buildAttentionRows({
        section: "awaiting",
        chats,
        agents,
        workerRows: input.workerRows,
        awaitingChatIds,
        t: input.t,
      }),
      ...buildAttentionRows({
        section: "unread",
        chats,
        agents,
        workerRows: input.workerRows,
        awaitingChatIds,
        t: input.t,
      }),
    );
  }

  const actions = buildActions(input).filter((action) => {
    if (!normalizedSearch) return true;
    return action.label.toLowerCase().includes(normalizedSearch);
  });
  rows.push(...actions);
  rows.push(...buildWorkers(input, normalizedSearch));
  rows.push(...buildSearchHistoryRows(input, normalizedSearch));

  return rows;
}

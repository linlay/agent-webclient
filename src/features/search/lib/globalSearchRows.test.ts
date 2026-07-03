import { buildGlobalRows } from "@/features/search/lib/globalSearchRows";
import type { GlobalRow } from "@/features/search/lib/globalSearchRows";
import type { Agent, Chat, WorkerConversationRow, WorkerRow } from "@/app/state/types";

function t(key: string): string {
  return key;
}

function createAgent(key: string, name = key): Agent {
  return {
    key,
    name,
    role: `${name} role`,
  };
}

function createWorkerRow(overrides: Partial<WorkerRow> = {}): WorkerRow {
  const sourceId = overrides.sourceId || "agent-alpha";
  return {
    key: overrides.key || `agent:${sourceId}`,
    type: "agent",
    sourceId,
    displayName: overrides.displayName || sourceId,
    role: overrides.role || "研究员",
    teamAgentLabels: [],
    latestChatId: "",
    latestRunId: "",
    latestUpdatedAt: 0,
    latestChatName: "",
    latestRunContent: "",
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: overrides.searchText || String(overrides.displayName || sourceId).toLowerCase(),
    ...overrides,
  };
}

function createChat(
  chatId: string,
  overrides: Partial<Chat> = {},
): Chat {
  return {
    chatId,
    chatName: `Chat ${chatId}`,
    agentKey: "agent-alpha",
    updatedAt: 1000,
    lastRunId: `run-${chatId}`,
    lastRunContent: `Content of ${chatId}`,
    ...overrides,
  };
}

function createHistoryRow(
  chatId: string,
  overrides: Partial<WorkerConversationRow> = {},
): WorkerConversationRow {
  return {
    chatId,
    chatName: `Chat ${chatId}`,
    agentKey: "agent-alpha",
    updatedAt: 1000,
    lastRunId: `run-${chatId}`,
    lastRunContent: `Content of ${chatId}`,
    ...overrides,
  };
}

function createInput(overrides: {
  agents?: Agent[];
  chats?: Chat[];
  workerRows?: WorkerRow[];
  historyRows?: WorkerConversationRow[] | null;
  searchText?: string;
  hasCurrentWorker?: boolean;
  workerIcons?: ReadonlyMap<string, unknown>;
}) {
  return {
    agents: overrides.agents ?? [createAgent("agent-alpha", "Alpha")],
    chats: overrides.chats ?? [],
    workerRows: overrides.workerRows ?? [
      createWorkerRow({
        key: "agent:agent-alpha",
        sourceId: "agent-alpha",
        displayName: "Alpha",
        searchText: "alpha",
      }),
    ],
    historyRows: overrides.historyRows,
    searchText: overrides.searchText ?? "",
    hasCurrentWorker: overrides.hasCurrentWorker ?? true,
    workerIcons: overrides.workerIcons as ReadonlyMap<string, unknown> | undefined,
    t: t as (key: string, params?: Record<string, unknown>) => string,
  };
}

function historyRows(rows: GlobalRow[]): Extract<GlobalRow, { kind: "history" }>[] {
  return rows.filter((row): row is Extract<GlobalRow, { kind: "history" }> => (
    row.kind === "history"
  ));
}

describe("buildGlobalRows", () => {
  it("orders default sections as awaiting, unread, actions, then workers", () => {
    const rows = buildGlobalRows(
      createInput({
        chats: [
          createChat("awaiting-1", {
            hasPendingAwaiting: true,
            awaiting: { mode: "approval" },
          }),
          createChat("unread-1", {
            read: { isRead: false },
          }),
        ],
      }),
    );

    expect(rows.map((row) => row.section)).toEqual([
      "awaiting",
      "unread",
      "actions",
      "actions",
      "actions",
      "actions",
      "actions",
      "workers",
    ]);
  });

  it("keeps awaiting chats out of unread even when they are unread", () => {
    const rows = buildGlobalRows(
      createInput({
        chats: [
          createChat("both-1", {
            hasPendingAwaiting: true,
            awaiting: { mode: "question" },
            read: { isRead: false },
          }),
        ],
      }),
    );

    expect(historyRows(rows).map((row) => [row.section, row.chatId])).toEqual([
      ["awaiting", "both-1"],
    ]);
  });

  it("sorts attention rows by updatedAt inside each agent and caps each agent at 5", () => {
    const chats = [
      ...Array.from({ length: 7 }, (_, index) =>
        createChat(`alpha-${index}`, {
          agentKey: "agent-alpha",
          hasPendingAwaiting: true,
          updatedAt: 1000 + index,
        }),
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        createChat(`beta-${index}`, {
          agentKey: "agent-beta",
          hasPendingAwaiting: true,
          updatedAt: 2000 + index,
        }),
      ),
    ];

    const rows = buildGlobalRows(
      createInput({
        agents: [
          createAgent("agent-alpha", "Alpha"),
          createAgent("agent-beta", "Beta"),
        ],
        workerRows: [
          createWorkerRow({
            key: "agent:agent-alpha",
            sourceId: "agent-alpha",
            displayName: "Alpha",
          }),
          createWorkerRow({
            key: "agent:agent-beta",
            sourceId: "agent-beta",
            displayName: "Beta",
          }),
        ],
        chats,
      }),
    );

    const awaitingRows = historyRows(rows).filter((row) => row.section === "awaiting");
    expect(awaitingRows.map((row) => row.chatId)).toEqual([
      "alpha-6",
      "alpha-5",
      "alpha-4",
      "alpha-3",
      "alpha-2",
      "beta-5",
      "beta-4",
      "beta-3",
      "beta-2",
      "beta-1",
    ]);
    expect(awaitingRows.filter((row) => row.sourceLabel === "Alpha")).toHaveLength(5);
    expect(awaitingRows.filter((row) => row.sourceLabel === "Beta")).toHaveLength(5);
  });

  it("applies the per-agent 5 row cap to unread chats", () => {
    const rows = buildGlobalRows(
      createInput({
        chats: Array.from({ length: 7 }, (_, index) =>
          createChat(`unread-${index}`, {
            read: { isRead: false },
            updatedAt: 1000 + index,
          }),
        ),
      }),
    );

    const unreadRows = historyRows(rows).filter((row) => row.section === "unread");
    expect(unreadRows.map((row) => row.chatId)).toEqual([
      "unread-6",
      "unread-5",
      "unread-4",
      "unread-3",
      "unread-2",
    ]);
  });

  it("does not append ordinary read history in the default empty-search view", () => {
    const rows = buildGlobalRows(
      createInput({
        chats: [
          createChat("read-1", {
            read: { isRead: true },
            hasPendingAwaiting: false,
          }),
        ],
        historyRows: [createHistoryRow("history-1")],
      }),
    );

    expect(historyRows(rows)).toHaveLength(0);
  });

  it("includes newConversation and history actions only when a current worker exists", () => {
    const rowsWithWorker = buildGlobalRows(createInput({ hasCurrentWorker: true }));
    const rowsWithoutWorker = buildGlobalRows(createInput({ hasCurrentWorker: false }));

    const actionKeysWithWorker = rowsWithWorker
      .filter((row): row is Extract<GlobalRow, { kind: "action" }> => row.kind === "action")
      .map((row) => row.key);
    const actionKeysWithoutWorker = rowsWithoutWorker
      .filter((row): row is Extract<GlobalRow, { kind: "action" }> => row.kind === "action")
      .map((row) => row.key);

    expect(actionKeysWithWorker).toEqual([
      "newConversation",
      "history",
      "switch",
      "settings",
      "debug",
    ]);
    expect(actionKeysWithoutWorker).toEqual(["switch", "settings", "debug"]);
  });

  it("caps worker rows at 20 and carries worker icons", () => {
    const iconData = { color: "#ff0000", name: "pulse" };
    const rows = buildGlobalRows(
      createInput({
        workerRows: Array.from({ length: 25 }, (_, index) =>
          createWorkerRow({
            key: `agent:${index}`,
            sourceId: `${index}`,
            displayName: `Agent ${index}`,
            searchText: `agent ${index}`,
          }),
        ),
        workerIcons: new Map<string, unknown>([["agent:0", iconData]]),
      }),
    );

    const workerRows = rows.filter((row): row is Extract<GlobalRow, { kind: "worker" }> => (
      row.kind === "worker"
    ));
    expect(workerRows).toHaveLength(20);
    expect(workerRows[0].icon).toEqual(iconData);
  });

  it("filters actions and workers during search and puts history after workers", () => {
    const rows = buildGlobalRows(
      createInput({
        searchText: "alpha",
        workerRows: [
          createWorkerRow({
            key: "agent:agent-alpha",
            sourceId: "agent-alpha",
            displayName: "Alpha",
            searchText: "alpha",
          }),
          createWorkerRow({
            key: "agent:agent-beta",
            sourceId: "agent-beta",
            displayName: "Beta",
            searchText: "beta",
          }),
        ],
        historyRows: [
          createHistoryRow("history-alpha", {
            chatName: "Project Alpha",
            updatedAt: 2000,
          }),
          createHistoryRow("history-beta", {
            chatName: "Project Beta",
            updatedAt: 3000,
          }),
        ],
      }),
    );

    expect(rows.map((row) => row.section)).toEqual(["workers", "history"]);
    expect(rows[0]).toMatchObject({ kind: "worker", key: "agent:agent-alpha" });
    expect(rows[1]).toMatchObject({ kind: "history", chatId: "history-alpha" });
  });

  it("falls back to loaded chats for search history when remote history is not available", () => {
    const rows = buildGlobalRows(
      createInput({
        searchText: "needle",
        chats: [
          createChat("local-1", {
            chatName: "Needle chat",
            updatedAt: 3000,
          }),
          createChat("local-2", {
            chatName: "Other chat",
            lastRunContent: "needle content",
            updatedAt: 2000,
          }),
        ],
        historyRows: null,
      }),
    );

    const searchRows = historyRows(rows).filter((row) => row.section === "history");
    expect(searchRows.map((row) => row.chatId)).toEqual(["local-1", "local-2"]);
  });

  it("caps search history rows at 10", () => {
    const rows = buildGlobalRows(
      createInput({
        searchText: "needle",
        historyRows: Array.from({ length: 15 }, (_, index) =>
          createHistoryRow(`history-${index}`, {
            chatName: `needle ${index}`,
            updatedAt: 1000 + index,
          }),
        ),
      }),
    );

    const searchRows = historyRows(rows).filter((row) => row.section === "history");
    expect(searchRows).toHaveLength(10);
    expect(searchRows[0].chatId).toBe("history-0");
  });

  it("uses readable content or untitled fallback for missing chat names", () => {
    const rows = buildGlobalRows(
      createInput({
        chats: [
          createChat("awaiting-readable", {
            chatName: "",
            lastRunContent: "Readable conversation preview",
            hasPendingAwaiting: true,
          }),
          createChat("awaiting-untitled", {
            chatName: "",
            lastRunContent: "",
            hasPendingAwaiting: true,
            updatedAt: 900,
          }),
        ],
      }),
    );

    const awaitingRows = historyRows(rows).filter((row) => row.section === "awaiting");
    expect(awaitingRows[0].label).toBe("Readable conversation preview");
    expect(awaitingRows[1].label).toBe("leftSidebar.titleUntitled");
  });

  it("assigns awaiting status labels from awaiting mode", () => {
    const rows = buildGlobalRows(
      createInput({
        chats: [
          createChat("awaiting-approval", {
            hasPendingAwaiting: true,
            awaiting: { mode: "approval" },
          }),
        ],
      }),
    );

    const awaitingRows = historyRows(rows).filter((row) => row.section === "awaiting");
    expect(awaitingRows[0].statusLabel).toBe("leftSidebar.awaitingStatus.approval");
  });
});

import { buildGlobalRows } from "@/features/workers/lib/globalCommandRows";
import type { GlobalRow } from "@/features/workers/lib/globalCommandRows";
import type { Agent, Chat, WorkerConversationRow, WorkerRow } from "@/app/state/types";

function t(key: string): string {
  return key;
}

function createWorkerRow(overrides: Partial<WorkerRow> = {}): WorkerRow {
  return {
    key: "agent:agent-alpha",
    type: "agent",
    sourceId: "agent-alpha",
    displayName: "Alpha",
    role: "研究员",
    teamAgentLabels: [],
    latestChatId: "",
    latestRunId: "",
    latestUpdatedAt: 0,
    latestChatName: "",
    latestRunContent: "",
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: "alpha",
    ...overrides,
  };
}

function createAgent(
  key: string,
  chats: Chat[] = [],
  overrides: Partial<Agent> = {},
): Agent {
  return {
    key,
    name: `${key} name`,
    role: "agent role",
    chats,
    ...overrides,
  };
}

function createChat(chatId: string, overrides: Partial<Chat> = {}): Chat {
  return {
    chatId,
    chatName: `Chat ${chatId}`,
    agentKey: "agent-alpha",
    updatedAt: 1000,
    lastRunId: `run-${chatId}`,
    lastRunContent: `Content of ${chatId}`,
    read: { isRead: true },
    ...overrides,
  } as Chat;
}

function createHistoryRow(
  chatId: string,
  overrides: Partial<WorkerConversationRow> = {},
): WorkerConversationRow {
  return {
    chatId,
    chatName: `Chat ${chatId}`,
    updatedAt: 1000,
    lastRunId: `run-${chatId}`,
    lastRunContent: `Content of ${chatId}`,
    ...overrides,
  };
}

function createInput(overrides: {
  agents?: Agent[];
  workerRows?: WorkerRow[];
  chats?: Chat[];
  historyRows?: WorkerConversationRow[] | null;
  searchText?: string;
  hasCurrentWorker?: boolean;
  workerIcons?: ReadonlyMap<string, unknown>;
}) {
  return {
    agents: overrides.agents ?? [],
    workerRows: overrides.workerRows ?? [],
    chats: overrides.chats ?? [],
    historyRows: overrides.historyRows,
    searchText: overrides.searchText ?? "",
    hasCurrentWorker: overrides.hasCurrentWorker ?? true,
    workerIcons: overrides.workerIcons as ReadonlyMap<string, unknown> | undefined,
    t: t as (key: string, params?: Record<string, unknown>) => string,
  };
}

function rowsBySection(
  rows: GlobalRow[],
  section: GlobalRow["section"],
): GlobalRow[] {
  return rows.filter((row) => row.section === section);
}

describe("buildGlobalRows", () => {
  it("orders default sections as awaiting, unread, actions, then workers", () => {
    const worker = createWorkerRow();
    const rows = buildGlobalRows(
      createInput({
        agents: [
          createAgent("agent-alpha", [
            createChat("chat_awaiting", {
              hasPendingAwaiting: true,
              awaiting: { mode: "approval" },
              read: { isRead: true },
            }),
            createChat("chat_unread", { read: { isRead: false } }),
          ]),
        ],
        workerRows: [worker],
      }),
    );

    const sections = rows.map((row) => row.section);
    expect(sections.indexOf("awaiting")).toBeLessThan(sections.indexOf("unread"));
    expect(sections.indexOf("unread")).toBeLessThan(sections.indexOf("actions"));
    expect(sections.indexOf("actions")).toBeLessThan(sections.indexOf("workers"));
  });

  it("shows awaiting chats only in awaiting even when they are unread", () => {
    const rows = buildGlobalRows(
      createInput({
        agents: [
          createAgent("agent-alpha", [
            createChat("chat_both", {
              hasPendingAwaiting: true,
              awaiting: { mode: "question" },
              read: { isRead: false },
            }),
            createChat("chat_unread", { read: { isRead: false } }),
          ]),
        ],
      }),
    );

    expect(rowsBySection(rows, "awaiting").map((row) => row.key)).toEqual([
      "awaiting:chat_both",
    ]);
    expect(rowsBySection(rows, "unread").map((row) => row.key)).toEqual([
      "unread:chat_unread",
    ]);
  });

  it("limits awaiting and unread to 5 rows per agent by /api/agents chat scope", () => {
    const agentAlphaAwaiting = Array.from({ length: 6 }, (_, index) =>
      createChat(`alpha_awaiting_${index}`, {
        agentKey: "agent-alpha",
        updatedAt: 1000 - index,
        hasPendingAwaiting: true,
        awaiting: { mode: "plan" },
      }),
    );
    const agentBetaUnread = Array.from({ length: 6 }, (_, index) =>
      createChat(`beta_unread_${index}`, {
        agentKey: "agent-beta",
        updatedAt: 900 - index,
        read: { isRead: false },
      }),
    );
    const rows = buildGlobalRows(
      createInput({
        agents: [
          createAgent("agent-alpha", agentAlphaAwaiting),
          createAgent("agent-beta", agentBetaUnread),
        ],
      }),
    );

    expect(rowsBySection(rows, "awaiting").map((row) => row.chatId)).toEqual([
      "alpha_awaiting_0",
      "alpha_awaiting_1",
      "alpha_awaiting_2",
      "alpha_awaiting_3",
      "alpha_awaiting_4",
    ]);
    expect(rowsBySection(rows, "unread").map((row) => row.chatId)).toEqual([
      "beta_unread_0",
      "beta_unread_1",
      "beta_unread_2",
      "beta_unread_3",
      "beta_unread_4",
    ]);
  });

  it("uses agent display names as source labels for default attention rows", () => {
    const rows = buildGlobalRows(
      createInput({
        agents: [
          createAgent(
            "agent-alpha",
            [
              createChat("chat_awaiting", {
                hasPendingAwaiting: true,
                awaiting: { mode: "form" },
              }),
            ],
            { name: "Alpha Agent" },
          ),
        ],
      }),
    );

    expect(rowsBySection(rows, "awaiting")[0]).toMatchObject({
      sourceLabel: "Alpha Agent",
      awaitingMode: "form",
    });
  });

  it("does not show ordinary read history in the default view", () => {
    const rows = buildGlobalRows(
      createInput({
        agents: [createAgent("agent-alpha", [createChat("chat_read")])],
        workerRows: [createWorkerRow()],
      }),
    );

    expect(rowsBySection(rows, "history")).toHaveLength(0);
    expect(rowsBySection(rows, "awaiting")).toHaveLength(0);
    expect(rowsBySection(rows, "unread")).toHaveLength(0);
  });

  it("includes newConversation and history actions when hasCurrentWorker is true", () => {
    const rows = buildGlobalRows(createInput({ hasCurrentWorker: true }));
    const actionKeys = rows
      .filter((row): row is Extract<GlobalRow, { kind: "action" }> => row.kind === "action")
      .map((row) => row.key);

    expect(actionKeys).toContain("newConversation");
    expect(actionKeys).toContain("history");
  });

  it("excludes newConversation and history actions when hasCurrentWorker is false", () => {
    const rows = buildGlobalRows(createInput({ hasCurrentWorker: false }));
    const actionKeys = rows
      .filter((row): row is Extract<GlobalRow, { kind: "action" }> => row.kind === "action")
      .map((row) => row.key);

    expect(actionKeys).not.toContain("newConversation");
    expect(actionKeys).not.toContain("history");
  });

  it("always includes switch, settings, and debug actions regardless of hasCurrentWorker", () => {
    const rowsWith = buildGlobalRows(createInput({ hasCurrentWorker: true }));
    const rowsWithout = buildGlobalRows(createInput({ hasCurrentWorker: false }));
    const actionKeysWith = rowsWith
      .filter((row): row is Extract<GlobalRow, { kind: "action" }> => row.kind === "action")
      .map((row) => row.key);
    const actionKeysWithout = rowsWithout
      .filter((row): row is Extract<GlobalRow, { kind: "action" }> => row.kind === "action")
      .map((row) => row.key);

    for (const key of ["switch", "settings", "debug"]) {
      expect(actionKeysWith).toContain(key);
      expect(actionKeysWithout).toContain(key);
    }
  });

  it("filters actions by search text", () => {
    const rows = buildGlobalRows(
      createInput({ hasCurrentWorker: true, searchText: "switch" }),
    );
    const actionRows = rows.filter((row) => row.kind === "action");

    expect(actionRows).toHaveLength(1);
    expect(actionRows[0].action).toBe("switch");
  });

  it("returns empty when no actions match search text and no workers/history", () => {
    const rows = buildGlobalRows(
      createInput({
        hasCurrentWorker: true,
        searchText: "zzz_nonexistent",
        workerRows: [],
        historyRows: [],
      }),
    );

    expect(rows).toHaveLength(0);
  });

  it("includes worker rows when no search text", () => {
    const worker1 = createWorkerRow({ key: "agent:a", displayName: "Alpha" });
    const worker2 = createWorkerRow({
      key: "agent:b",
      type: "agent",
      sourceId: "b",
      displayName: "Beta",
      searchText: "beta",
    });
    const rows = buildGlobalRows(
      createInput({ workerRows: [worker1, worker2] }),
    );
    const workerRows = rows.filter((row) => row.kind === "worker");

    expect(workerRows).toHaveLength(2);
    expect(workerRows[0].key).toBe("agent:a");
    expect(workerRows[1].key).toBe("agent:b");
  });

  it("filters workers by search text", () => {
    const worker1 = createWorkerRow({ key: "agent:a", displayName: "Alpha" });
    const worker2 = createWorkerRow({
      key: "agent:b",
      type: "agent",
      sourceId: "b",
      displayName: "Beta",
      searchText: "beta",
    });
    const rows = buildGlobalRows(
      createInput({ workerRows: [worker1, worker2], searchText: "beta" }),
    );
    const workerRows = rows.filter((row) => row.kind === "worker");

    expect(workerRows).toHaveLength(1);
    expect(workerRows[0].key).toBe("agent:b");
  });

  it("caps worker results at 20", () => {
    const manyWorkers = Array.from({ length: 25 }, (_, index) =>
      createWorkerRow({
        key: `agent:${index}`,
        sourceId: `${index}`,
        displayName: `Agent ${index}`,
        searchText: `agent ${index}`,
      }),
    );
    const rows = buildGlobalRows(createInput({ workerRows: manyWorkers }));
    const workerRows = rows.filter((row) => row.kind === "worker");

    expect(workerRows).toHaveLength(20);
  });

  it("carries worker icon from workerIcons map", () => {
    const worker = createWorkerRow({ key: "agent:a", displayName: "Alpha" });
    const iconData = { color: "#ff0000", name: "pulse" };
    const icons = new Map<string, unknown>([["agent:a", iconData]]);
    const rows = buildGlobalRows(
      createInput({ workerRows: [worker], workerIcons: icons }),
    );
    const workerRows = rows.filter((row) => row.kind === "worker");

    expect(workerRows[0].icon).toEqual(iconData);
  });

  it("shows matching chat history after workers while searching", () => {
    const worker = createWorkerRow({ key: "agent:a", displayName: "Alpha" });
    const history = [
      createHistoryRow("chat-1", {
        chatName: "Project Alpha",
        agentKey: "a",
        lastRunContent: "fix login bug",
      }),
      createHistoryRow("chat-2", { chatName: "Project Beta" }),
    ];
    const rows = buildGlobalRows(
      createInput({
        workerRows: [worker],
        historyRows: history,
        searchText: "alpha",
      }),
    );

    expect(rowsBySection(rows, "history").map((row) => row.chatId)).toEqual([
      "chat-1",
    ]);
    expect(rows.map((row) => row.section).lastIndexOf("workers")).toBeLessThan(
      rows.map((row) => row.section).indexOf("history"),
    );
  });

  it("filters history rows by chatId and lastRunContent during search", () => {
    const rowsByChatId = buildGlobalRows(
      createInput({
        historyRows: [
          createHistoryRow("chat-abc"),
          createHistoryRow("chat-xyz"),
        ],
        searchText: "abc",
      }),
    );
    const rowsByContent = buildGlobalRows(
      createInput({
        historyRows: [
          createHistoryRow("chat-1", { lastRunContent: "fix login bug" }),
          createHistoryRow("chat-2", { lastRunContent: "add pagination" }),
        ],
        searchText: "login",
      }),
    );

    expect(rowsBySection(rowsByChatId, "history").map((row) => row.chatId)).toEqual([
      "chat-abc",
    ]);
    expect(rowsBySection(rowsByContent, "history").map((row) => row.chatId)).toEqual([
      "chat-1",
    ]);
  });

  it("caps search history results at 10", () => {
    const manyHistory = Array.from({ length: 15 }, (_, index) =>
      createHistoryRow(`chat-${index}`, { chatName: "Search Match" }),
    );
    const rows = buildGlobalRows(
      createInput({ historyRows: manyHistory, searchText: "match" }),
    );
    const historyRows = rows.filter((row) => row.kind === "history");

    expect(historyRows).toHaveLength(10);
  });

  it("trims and lowercases search text", () => {
    const history = [createHistoryRow("chat-1", { chatName: "Alpha" })];
    const rows = buildGlobalRows(
      createInput({ historyRows: history, searchText: "  ALPHA  " }),
    );
    const historyRows = rows.filter((row) => row.kind === "history");

    expect(historyRows).toHaveLength(1);
  });
});

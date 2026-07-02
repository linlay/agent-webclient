import { buildGlobalRows } from "@/features/search/lib/globalSearchRows";
import type { GlobalRow } from "@/features/search/lib/globalSearchRows";
import type { WorkerConversationRow, WorkerRow } from "@/app/state/types";

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
  workerRows?: WorkerRow[];
  historyRows?: WorkerConversationRow[];
  searchText?: string;
  hasCurrentWorker?: boolean;
  workerIcons?: ReadonlyMap<string, unknown>;
}) {
  return {
    workerRows: overrides.workerRows ?? [],
    historyRows: overrides.historyRows ?? [],
    searchText: overrides.searchText ?? "",
    hasCurrentWorker: overrides.hasCurrentWorker ?? true,
    workerIcons: overrides.workerIcons as ReadonlyMap<string, unknown> | undefined,
    t: t as (key: string, params?: Record<string, unknown>) => string,
  };
}

describe("buildGlobalRows", () => {
  it("includes newConversation and history actions when hasCurrentWorker is true", () => {
    const rows = buildGlobalRows(
      createInput({ hasCurrentWorker: true }),
    );
    const actionKeys = rows
      .filter((r): r is Extract<GlobalRow, { kind: "action" }> => r.kind === "action")
      .map((r) => r.key);
    expect(actionKeys).toContain("newConversation");
    expect(actionKeys).toContain("history");
  });

  it("excludes newConversation and history actions when hasCurrentWorker is false", () => {
    const rows = buildGlobalRows(
      createInput({ hasCurrentWorker: false }),
    );
    const actionKeys = rows
      .filter((r): r is Extract<GlobalRow, { kind: "action" }> => r.kind === "action")
      .map((r) => r.key);
    expect(actionKeys).not.toContain("newConversation");
    expect(actionKeys).not.toContain("history");
  });

  it("always includes switch, settings, and debug actions regardless of hasCurrentWorker", () => {
    const rowsWith = buildGlobalRows(
      createInput({ hasCurrentWorker: true }),
    );
    const actionKeysWith = rowsWith
      .filter((r): r is Extract<GlobalRow, { kind: "action" }> => r.kind === "action")
      .map((r) => r.key);

    const rowsWithout = buildGlobalRows(
      createInput({ hasCurrentWorker: false }),
    );
    const actionKeysWithout = rowsWithout
      .filter((r): r is Extract<GlobalRow, { kind: "action" }> => r.kind === "action")
      .map((r) => r.key);

    for (const key of ["switch", "settings", "debug"]) {
      expect(actionKeysWith).toContain(key);
      expect(actionKeysWithout).toContain(key);
    }
  });

  it("filters actions by search text", () => {
    const rows = buildGlobalRows(
      createInput({ hasCurrentWorker: true, searchText: "switch" }),
    );
    const actionRows = rows.filter((r) => r.kind === "action");
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
    const workerRows = rows.filter((r) => r.kind === "worker");
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
    const workerRows = rows.filter((r) => r.kind === "worker");
    expect(workerRows).toHaveLength(1);
    expect(workerRows[0].key).toBe("agent:b");
  });

  it("caps worker results at 20", () => {
    const manyWorkers = Array.from({ length: 25 }, (_, i) =>
      createWorkerRow({
        key: `agent:${i}`,
        sourceId: `${i}`,
        displayName: `Agent ${i}`,
        searchText: `agent ${i}`,
      }),
    );
    const rows = buildGlobalRows(
      createInput({ workerRows: manyWorkers }),
    );
    const workerRows = rows.filter((r) => r.kind === "worker");
    expect(workerRows).toHaveLength(20);
  });

  it("carries worker icon from workerIcons map", () => {
    const worker1 = createWorkerRow({ key: "agent:a", displayName: "Alpha" });
    const iconData = { color: "#ff0000", name: "pulse" };
    const icons = new Map<string, unknown>([["agent:a", iconData]]);
    const rows = buildGlobalRows(
      createInput({ workerRows: [worker1], workerIcons: icons }),
    );
    const workerRows = rows.filter((r) => r.kind === "worker");
    expect(workerRows[0].icon).toEqual(iconData);
  });

  it("includes history rows when hasCurrentWorker is true", () => {
    const history = [
      createHistoryRow("chat-1"),
      createHistoryRow("chat-2", { chatName: "Second Chat" }),
    ];
    const rows = buildGlobalRows(
      createInput({ historyRows: history }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows).toHaveLength(2);
    expect(historyRows[0].chatId).toBe("chat-1");
    expect(historyRows[1].chatId).toBe("chat-2");
  });

  it("excludes history rows when hasCurrentWorker is false", () => {
    const history = [createHistoryRow("chat-1")];
    const rows = buildGlobalRows(
      createInput({ hasCurrentWorker: false, historyRows: history }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows).toHaveLength(0);
  });

  it("filters history rows by search text (chatName)", () => {
    const history = [
      createHistoryRow("chat-1", { chatName: "Project Alpha" }),
      createHistoryRow("chat-2", { chatName: "Project Beta" }),
    ];
    const rows = buildGlobalRows(
      createInput({ historyRows: history, searchText: "alpha" }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].chatId).toBe("chat-1");
  });

  it("filters history rows by search text (chatId)", () => {
    const history = [
      createHistoryRow("chat-abc"),
      createHistoryRow("chat-xyz"),
    ];
    const rows = buildGlobalRows(
      createInput({ historyRows: history, searchText: "abc" }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].chatId).toBe("chat-abc");
  });

  it("filters history rows by search text (lastRunContent)", () => {
    const history = [
      createHistoryRow("chat-1", { lastRunContent: "fix login bug" }),
      createHistoryRow("chat-2", { lastRunContent: "add pagination" }),
    ];
    const rows = buildGlobalRows(
      createInput({ historyRows: history, searchText: "login" }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].chatId).toBe("chat-1");
  });

  it("caps history results at 10", () => {
    const manyHistory = Array.from({ length: 15 }, (_, i) =>
      createHistoryRow(`chat-${i}`),
    );
    const rows = buildGlobalRows(
      createInput({ historyRows: manyHistory }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows).toHaveLength(10);
  });

  it("includes snippet field on history rows", () => {
    const history = [
      createHistoryRow("chat-1", { lastRunContent: "some content" }),
    ];
    const rows = buildGlobalRows(
      createInput({ historyRows: history }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows[0].snippet).toBe("some content");
  });

  it("omits snippet when lastRunContent is empty", () => {
    const history = [
      createHistoryRow("chat-1", { lastRunContent: "" }),
    ];
    const rows = buildGlobalRows(
      createInput({ historyRows: history }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows[0].snippet).toBeUndefined();
  });

  it("orders rows as actions, then workers, then history", () => {
    const worker1 = createWorkerRow({ key: "agent:a", displayName: "Alpha" });
    const history = [createHistoryRow("chat-1")];
    const rows = buildGlobalRows(
      createInput({ workerRows: [worker1], historyRows: history }),
    );

    const kinds = rows.map((r) => r.kind);
    const firstActionIndex = kinds.indexOf("action");
    const firstWorkerIndex = kinds.indexOf("worker");
    const firstHistoryIndex = kinds.indexOf("history");

    expect(firstActionIndex).not.toBe(-1);
    expect(firstWorkerIndex).not.toBe(-1);
    expect(firstHistoryIndex).not.toBe(-1);

    expect(firstActionIndex).toBeLessThan(firstWorkerIndex);
    expect(firstWorkerIndex).toBeLessThan(firstHistoryIndex);
  });

  it("trims and lowercases search text", () => {
    const history = [createHistoryRow("chat-1", { chatName: "Alpha" })];
    const rows = buildGlobalRows(
      createInput({ historyRows: history, searchText: "  ALPHA  " }),
    );
    const historyRows = rows.filter((r) => r.kind === "history");
    expect(historyRows).toHaveLength(1);
  });
});

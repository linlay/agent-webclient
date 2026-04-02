import { createInitialState } from "../context/AppContext";
import type { WorkerRow } from "../context/types";
import {
  resolvePreferredAgentKey,
  resolvePreferredTeamId,
} from "./queryRouting";

function createWorkerRow(overrides: Partial<WorkerRow> = {}): WorkerRow {
  return {
    key: "agent:demo-agent",
    type: "agent",
    sourceId: "demo-agent",
    displayName: "Demo Agent",
    role: "",
    teamAgentLabels: [],
    latestChatId: "",
    latestRunId: "",
    latestUpdatedAt: 0,
    latestChatName: "",
    latestRunContent: "",
    hasHistory: false,
    latestRunSortValue: 0,
    searchText: "",
    ...overrides,
  };
}

describe("queryRouting", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => "",
      },
    });
  });

  it("falls back to the selected agent worker for pending upload chats", () => {
    const state = createInitialState();
    const selectedAgent = createWorkerRow();
    state.workerSelectionKey = selectedAgent.key;
    state.workerIndexByKey.set(selectedAgent.key, selectedAgent);

    expect(resolvePreferredAgentKey(state)).toBe("demo-agent");
  });

  it("prefers remembered chat bindings for existing chats", () => {
    const state = createInitialState();
    state.chatId = "chat_1";
    state.chatAgentById.set("chat_1", "bound-agent");

    expect(resolvePreferredAgentKey(state)).toBe("bound-agent");
  });

  it("prefers explicit agent key over remembered chat bindings", () => {
    const state = createInitialState();
    state.chatId = "chat_1";
    state.chatAgentById.set("chat_1", "bound-agent");

    expect(
      resolvePreferredAgentKey(state, {
        chatId: "chat_1",
        explicitAgentKey: "explicit-agent",
      }),
    ).toBe("explicit-agent");
  });

  it("returns empty agent key when no routing context is available", () => {
    const state = createInitialState();

    expect(
      resolvePreferredAgentKey(state, {
        chatId: "chat_from_upload",
      }),
    ).toBe("");
  });

  it("returns selected team only when no chat is active", () => {
    const state = createInitialState();
    const selectedTeam = createWorkerRow({
      key: "team:demo-team",
      type: "team",
      sourceId: "demo-team",
    });
    state.workerSelectionKey = selectedTeam.key;
    state.workerIndexByKey.set(selectedTeam.key, selectedTeam);

    expect(resolvePreferredTeamId(state)).toBe("demo-team");
    expect(resolvePreferredTeamId(state, { chatId: "chat_1" })).toBe("");
  });
});

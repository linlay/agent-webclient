import { createInitialState } from "@/app/state/AppContext";
import {
  createMemoryPreferenceDraftRecord,
  formatScopeTabLabel,
  hydratePreferenceDrafts,
  resolveMemoryAgentContext,
  resolveMemoryPreviewContext,
  syncSelectedPreferenceDraftFromLiveValues,
  toScopeRecordInputs,
} from "@/features/settings/lib/memoryInfo";

describe("resolveMemoryAgentContext", () => {
  it("prefers the currently selected agent worker", () => {
    const state = createInitialState();
    const nextState = {
      ...state,
      agents: [{ key: "agent-alice", name: "Alice" }],
      workerRows: [
        {
          key: "agent:agent-alice",
          type: "agent" as const,
          sourceId: "agent-alice",
          displayName: "Alice",
          role: "助手",
          teamAgentLabels: [],
          latestChatId: "",
          latestRunId: "",
          latestUpdatedAt: 0,
          latestChatName: "",
          latestRunContent: "",
          hasHistory: false,
          latestRunSortValue: -1,
          searchText: "alice",
        },
      ],
      workerIndexByKey: new Map(),
      workerSelectionKey: "agent:agent-alice",
    };
    nextState.workerIndexByKey.set("agent:agent-alice", nextState.workerRows[0]);

    expect(resolveMemoryAgentContext(nextState)).toEqual({
      agentKey: "agent-alice",
      label: "Alice",
      source: "worker",
    });
  });

  it("falls back to the current chat agent binding when no agent worker is selected", () => {
    const state = createInitialState();

    expect(
      resolveMemoryAgentContext({
        ...state,
        agents: [{ key: "agent-chat", name: "Chat Agent" }],
        chatId: "chat_1",
        chats: [{ chatId: "chat_1", chatName: "demo" }],
        chatAgentById: new Map([["chat_1", "agent-chat"]]),
        workerSelectionKey: "team:team-ops",
      }),
    ).toEqual({
      agentKey: "agent-chat",
      label: "Chat Agent",
      source: "chat",
    });
  });

  it("returns none when neither worker nor chat provides an agent context", () => {
    const state = createInitialState();

    expect(resolveMemoryAgentContext(state)).toEqual({
      agentKey: "",
      label: "",
      source: "none",
    });
  });

  it("prefers the active chat for preview context when chatId exists", () => {
    const state = createInitialState();

    expect(
      resolveMemoryPreviewContext({
        ...state,
        chatId: "chat_1",
        chats: [
          {
            chatId: "chat_1",
            chatName: "demo",
            teamId: "team-ops",
          },
        ],
      }),
    ).toEqual({
      chatId: "chat_1",
      teamId: "team-ops",
      source: "active-chat",
    });
  });

  it("falls back to the selected worker's latest related chat for preview context", () => {
    const state = createInitialState();

    expect(
      resolveMemoryPreviewContext({
        ...state,
        workerSelectionKey: "agent:agent-alice",
        workerRelatedChats: [
          {
            chatId: "chat_worker_1",
            chatName: "worker chat",
            updatedAt: 100,
            lastRunId: "run_1",
            lastRunContent: "hello",
            teamId: "team-worker",
          },
        ],
      }),
    ).toEqual({
      chatId: "chat_worker_1",
      teamId: "team-worker",
      source: "worker-chat",
    });
  });

  it("hydrates persisted scope records into editable drafts and converts them back to save inputs", () => {
    const drafts = hydratePreferenceDrafts([
      {
        id: "mem_101",
        title: "偏好中文输出",
        summary: "Prefer Chinese output.",
        category: "general",
        importance: 8,
        confidence: 0.95,
        status: "active",
        scopeType: "agent",
        scopeKey: "agent:agent-a",
        tags: ["preference"],
        createdAt: 100,
        updatedAt: 200,
      },
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.clientId).toContain("draft:");
    expect(drafts[0]?.scopeType).toBe("agent");
    expect(toScopeRecordInputs(drafts)).toEqual([
      {
        id: "mem_101",
        title: "偏好中文输出",
        summary: "Prefer Chinese output.",
        category: "general",
        importance: 8,
        confidence: 0.95,
        tags: ["preference"],
      },
    ]);
  });

  it("syncs the selected draft with live editor values before saving", () => {
    const [draft] = hydratePreferenceDrafts([
      {
        id: "mem_101",
        title: "",
        summary: "",
        category: "general",
        importance: 5,
        confidence: 0.8,
        status: "active",
        scopeType: "agent",
        scopeKey: "agent:agent-a",
        tags: [],
        createdAt: 100,
        updatedAt: 200,
      },
    ]);

    const synced = syncSelectedPreferenceDraftFromLiveValues(
      draft ? [draft] : [],
      draft?.clientId || "",
      {
        title: "我的偏好123123",
        summary: "我的偏好我的偏好",
        category: "general",
        importance: "5",
        confidence: "0.9",
        tags: "pref,zh",
      },
    );

    expect(toScopeRecordInputs(synced)).toEqual([
      {
        id: "mem_101",
        title: "我的偏好123123",
        summary: "我的偏好我的偏好",
        category: "general",
        importance: 5,
        confidence: 0.9,
        tags: ["pref", "zh"],
      },
    ]);
  });

  it("creates a new preference draft with normalized defaults", () => {
    const draft = createMemoryPreferenceDraftRecord({
      title: "新的偏好",
    });

    expect(draft.clientId).toContain("draft:");
    expect(draft.title).toBe("新的偏好");
    expect(draft.category).toBe("general");
    expect(draft.importance).toBe(5);
    expect(draft.confidence).toBe(0.8);
  });

  it("formats scope tab labels with counts", () => {
    expect(
      formatScopeTabLabel({
        scopeType: "agent",
        scopeKey: "agent:demo",
        label: "AGENT",
        fileName: "AGENT.md",
        recordCount: 3,
        updatedAt: 100,
      }),
    ).toBe("AGENT (3)");
  });
});

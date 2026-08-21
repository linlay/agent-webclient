import type { Agent, Chat, Team } from "@/app/state/types";
import {
  ALL_HISTORY_OWNERS,
  buildGlobalHistoryOwnerOptions,
  filterGlobalHistoryChats,
  resolveChatHistoryOwnerKey,
} from "@/features/chats/lib/globalHistory";

const DAY = 24 * 60 * 60 * 1000;
const BASE = 1_777_344_000_000;

function chat(overrides: Partial<Chat>): Chat {
  return {
    chatId: "chat-default",
    chatName: "Default chat",
    updatedAt: BASE,
    ...overrides,
  };
}

describe("global history", () => {
  const chats = [
    chat({
      chatId: "chat-alpha-new",
      chatName: "Alpha deployment",
      agentKey: "alpha",
      updatedAt: BASE + 2 * DAY,
      lastRunContent: "production rollout",
    }),
    chat({
      chatId: "chat-alpha-old",
      chatName: "Alpha review",
      firstAgentKey: "alpha",
      updatedAt: BASE,
      lastRunContent: "design notes",
    }),
    chat({
      chatId: "chat-team",
      chatName: "Ops incident",
      agentKey: "stale-member",
      teamId: "ops",
      updatedAt: BASE + DAY,
      lastRunContent: "service restored",
    }),
    chat({
      chatId: "chat-no-time",
      chatName: "No timestamp",
      agentKey: "beta",
      updatedAt: undefined,
    }),
  ];

  it("keeps the default view global and sorts by freshness with a stable tie-break", () => {
    const sameTime = chat({
      chatId: "chat-alpha-a",
      agentKey: "alpha",
      updatedAt: BASE + 2 * DAY,
    });
    const rows = filterGlobalHistoryChats([...chats, sameTime], {
      ownerKey: ALL_HISTORY_OWNERS,
    });

    expect(rows.map((row) => row.chatId)).toEqual([
      "chat-alpha-a",
      "chat-alpha-new",
      "chat-team",
      "chat-alpha-old",
      "chat-no-time",
    ]);
  });

  it("combines keyword, owner, and inclusive date filters", () => {
    const rows = filterGlobalHistoryChats(chats, {
      query: "production",
      ownerKey: "agent:alpha",
      startAt: BASE + 2 * DAY,
      endAt: BASE + 2 * DAY,
    });

    expect(rows.map((row) => row.chatId)).toEqual(["chat-alpha-new"]);
  });

  it("filters Agent and Team owners while Team ownership wins over stale agent identity", () => {
    expect(resolveChatHistoryOwnerKey(chats[2])).toBe("team:ops");
    expect(
      filterGlobalHistoryChats(chats, { ownerKey: "team:ops" }).map(
        (row) => row.chatId,
      ),
    ).toEqual(["chat-team"]);
    expect(
      filterGlobalHistoryChats(chats, { ownerKey: "agent:alpha" }).map(
        (row) => row.chatId,
      ),
    ).toEqual(["chat-alpha-new", "chat-alpha-old"]);
  });

  it("excludes missing or invalid timestamps only when a date boundary is active", () => {
    expect(filterGlobalHistoryChats(chats).map((row) => row.chatId)).toContain(
      "chat-no-time",
    );
    expect(
      filterGlobalHistoryChats(chats, { startAt: BASE }).map(
        (row) => row.chatId,
      ),
    ).not.toContain("chat-no-time");
  });

  it("builds friendly catalog options and falls back to identities found in chats", () => {
    const agents: Agent[] = [{ key: "alpha", name: "Alpha Agent" }];
    const teams: Team[] = [{ teamId: "ops", name: "Operations" }];
    const options = buildGlobalHistoryOwnerOptions({ agents, chats, teams });

    expect(options).toEqual([
      { key: "agent:alpha", label: "Alpha Agent", sourceId: "alpha", type: "agent" },
      { key: "agent:beta", label: "beta", sourceId: "beta", type: "agent" },
      { key: "team:ops", label: "Operations", sourceId: "ops", type: "team" },
    ]);
  });
});

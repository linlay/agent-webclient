import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import { buildWorkerRows } from "./workerListFormatter";
import { isProjectAgent, splitSidebarWorkers, selectGeneralSidebarChats } from "./sidebarNavigation";

const agents: Agent[] = [
  { key: "general-coder", name: "General coder", mode: "CODER", workspaceDir: "  " },
  { key: "project-kbase", name: "Project knowledge", mode: "KBASE", workspaceDir: " /work/docs " },
  { key: "general", name: "Assistant" },
];
const chat = (chatId: string, agentKey: string, updatedAt = 100): Chat => ({ chatId, chatName: chatId, agentKey, updatedAt: 1710000000000 + updatedAt });

describe("sidebar navigation ownership", () => {
  it("classifies by workspace independently of agent names and modes", () => {
    expect(agents.map(isProjectAgent)).toEqual([false, true, false]);
    const rows = buildWorkerRows({ chats: [], agents: [...agents, { key: "team", name: "Team", mode: "TEAM" }] });
    const groups = splitSidebarWorkers(rows, agents);
    expect(groups.general.map(row => row.sourceId)).toEqual(["general", "general-coder", "team"]);
    expect(groups.projects.map(row => row.sourceId)).toEqual(["project-kbase"]);
  });

  it("keeps pins and project history out of general previews, preserving deleted historical owners", () => {
    const chats = [chat("general-new", "general", 300), chat("coder", "general-coder", 200),
      chat("project", "project-kbase"), chat("pinned", "general"),
      { ...chat("server-pinned", "general"), pinned: true },
      { ...chat("team", "general"), agentKey: "team" },
      chat("historical-owner", "deleted-agent", 250), chat("unknown", "unknown")];
    const rows = selectGeneralSidebarChats({ chats, agents, fetchedIds: ["historical-owner", "project", "team"], pinnedOrder: ["pinned"] });
    expect(rows.map(row => row.chatId)).toEqual(["general-new", "historical-owner", "coder", "team"]);
    expect(rows[1].agentKey).toBe("deleted-agent");
  });

  it("orders by time descending by default with deterministic ties", () => {
    const chats = [chat("A", "general", 50), chat("B", "general", 100), { ...chat("A-new", "general", 50), chatName: "A" }];
    expect(selectGeneralSidebarChats({ chats, agents, fetchedIds: [] }).map(row => row.chatId)).toEqual(["B", "A", "A-new"]);
  });

  it("orders by time ascending when the toggle is flipped", () => {
    const chats = [chat("A", "general", 50), chat("B", "general", 100), { ...chat("A-new", "general", 50), chatName: "A" }];
    expect(selectGeneralSidebarChats({ chats, agents, fetchedIds: [], sortDirection: "asc" }).map(row => row.chatId)).toEqual(["A", "A-new", "B"]);
  });
});

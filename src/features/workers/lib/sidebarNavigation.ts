import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import type { WorkerConversationRow, WorkerRow } from "./workerState";
import { toWorkerConversationRow } from "./workerConversationFormatter";

export type SidebarChatSort = "byTime" | "byName";
export const GENERAL_CHAT_LIMIT = 8;
export const GENERAL_CHAT_MAX = 24;
export const PROJECT_CHAT_LIMIT = 5;
export const PROJECT_CHAT_MAX = 20;

export function isProjectAgent(agent: Pick<Agent, "workspaceDir">): boolean {
  return Boolean(String(agent.workspaceDir || "").trim());
}

export function splitSidebarWorkers(rows: WorkerRow[], agents: Agent[]) {
  const projects = new Set(agents.filter(isProjectAgent).map(agent => agent.key));
  return {
    general: rows.filter(row => row.type === "agent" && !projects.has(row.sourceId)),
    projects: rows.filter(row => row.type === "agent" && projects.has(row.sourceId)),
  };
}

export function selectGeneralSidebarChats(input: {
  chats: Chat[];
  agents: Agent[];
  fetchedIds: string[];
  pinnedOrder?: string[] | null;
  sort: SidebarChatSort;
}): WorkerConversationRow[] {
  const knownGeneral = new Set(input.agents.filter(agent => !isProjectAgent(agent)).map(agent => agent.key));
  const projectKeys = new Set(input.agents.filter(isProjectAgent).map(agent => agent.key));
  const fetched = new Set(input.fetchedIds);
  const pins = new Set(input.pinnedOrder || []);
  return input.chats.filter(chat => {
    if (chat.pinned || pins.has(chat.chatId) || undefined || false) return false;
    const owner = String(chat.agentKey || chat.firstAgentKey || "");
    return !projectKeys.has(owner) && (knownGeneral.has(owner) || fetched.has(chat.chatId));
  }).map(toWorkerConversationRow).sort((a, b) => {
    if (input.sort === "byName") {
      const byName = (a.chatName || a.lastRunContent).localeCompare(b.chatName || b.lastRunContent, "zh-CN", { numeric: true });
      if (byName) return byName;
    }
    return b.updatedAt - a.updatedAt || a.chatId.localeCompare(b.chatId);
  });
}

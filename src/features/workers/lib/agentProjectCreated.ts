import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/AppContext";
import type { ActionDispatch, MutableValueRef } from "@/shared/contracts/stateInterop";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import { buildWorkerRows } from "@/features/workers/lib/workerListFormatter";
import { splitWorkerListItems } from "@/features/workers/lib/workerDataCoordinator";
import { readSidebarAgents } from "./sidebarAgentData";

export async function handleCreateAgentSuccess(
  createdKey: string,
  dispatch: ActionDispatch<AppAction>,
  stateRef: MutableValueRef<AppState>,
) {
  if (!createdKey) return;
  const items = await readSidebarAgents({
    includeChats: 5,
    chatsPinned: false,

    scope: "nav",
  });
  const workers = splitWorkerListItems(items);
  const chats = mergeFetchedChats(stateRef.current.chats, workers.chats);
  dispatch({ type: "SET_AGENTS", agents: workers.agents });

  dispatch({ type: "SET_WORKER_ORDER_KEYS", workerOrderKeys: workers.workerOrderKeys });
  dispatch({ type: "SET_CHATS", chats });
  dispatch({
    type: "SET_WORKER_ROWS",
    rows: buildWorkerRows({
      agents: workers.agents,

      chats,
      workerOrderKeys: workers.workerOrderKeys,
      workerPriorityKey: `agent:${createdKey}`,
    }),
  });
  dispatch({ type: "SET_TEMPORARY_PINNED_AGENT_KEY", agentKey: createdKey });
  dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey: `agent:${createdKey}` });
  dispatch({ type: "SET_WORKER_RELATED_CHATS", chats: [] });
  dispatch({ type: "SET_WORKER_CHAT_PANEL_COLLAPSED", collapsed: true });
}

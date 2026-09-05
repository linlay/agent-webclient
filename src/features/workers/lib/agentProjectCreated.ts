import type React from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState, WorkerListItem } from "@/app/state/types";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import { buildWorkerRows } from "@/features/workers/lib/workerListFormatter";
import { splitWorkerListItems } from "@/features/workers/lib/workerDataCoordinator";
import { getAgents } from "@/shared/data";

export async function handleCreateAgentSuccess(
  createdKey: string,
  dispatch: React.Dispatch<AppAction>,
  stateRef: React.MutableRefObject<AppState>,
) {
  if (!createdKey) return;
  const agentsResponse = await getAgents({
    includeChats: 5,
    includeTeam: true,
    scope: "nav",
  });
  const workers = splitWorkerListItems(
    Array.isArray(agentsResponse.data)
      ? (agentsResponse.data as WorkerListItem[])
      : [],
  );
  const chats = mergeFetchedChats(stateRef.current.chats, workers.chats);
  dispatch({ type: "SET_AGENTS", agents: workers.agents });
  dispatch({ type: "SET_TEAMS", teams: workers.teams });
  dispatch({ type: "SET_WORKER_ORDER_KEYS", workerOrderKeys: workers.workerOrderKeys });
  dispatch({ type: "SET_CHATS", chats });
  dispatch({
    type: "SET_WORKER_ROWS",
    rows: buildWorkerRows({
      agents: workers.agents,
      teams: workers.teams,
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

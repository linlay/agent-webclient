import { useState } from "react";
import type React from "react";
import { message } from "antd";
import { useAppContext, type AppAction } from "@/app/state/AppContext";
import type { AppState, WorkerListItem } from "@/app/state/types";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import {
  ACP_PROXY_OPTIONS,
  buildCoderAgentCreateRequest,
  buildKbaseAgentCreateRequest,
  type AgentProjectType,
  workspaceNameFromPath,
} from "@/features/workers/lib/agentCreate";
import { buildWorkerRows } from "@/features/workers/lib/workerListFormatter";
import { splitWorkerListItems } from "@/features/workers/lib/workerDataCoordinator";
import { createAgent, getAgents } from "@/shared/data";
import { useI18n } from "@/shared/i18n";

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

export function useAgentProjectCreate() {
  const { dispatch, stateRef } = useAppContext();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [projectType, setProjectType] = useState<AgentProjectType>("coder");
  const [useAcp, setUseAcp] = useState(false);
  const [selectedAcpBridgeId, setSelectedAcpBridgeId] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const begin = () => {
    if (open) return;
    setWorkspaceDir("");
    setProjectName("");
    setProjectType("coder");
    setUseAcp(false);
    setSelectedAcpBridgeId(ACP_PROXY_OPTIONS[0]?.value || "");
    setProjectNameTouched(false);
    setOpen(true);
  };

  const submit = async () => {
    const trimmedDir = workspaceDir.trim();
    if (!trimmedDir) {
      void message.warning(t("leftSidebar.createProject.directoryRequired"));
      return;
    }
    const name = projectName.trim() || workspaceNameFromPath(trimmedDir);
    if (projectType === "coder" && useAcp && !selectedAcpBridgeId) {
      void message.warning(t("leftSidebar.createProject.acpRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const definition = projectType === "kbase"
        ? buildKbaseAgentCreateRequest(trimmedDir, { name })
        : buildCoderAgentCreateRequest(trimmedDir, {
            name,
            acpBridgeId: useAcp ? selectedAcpBridgeId : undefined,
          });
      const response = await createAgent(definition);
      const createdKey = String(response.data?.key || "").trim();
      setOpen(false);
      void handleCreateAgentSuccess(createdKey, dispatch, stateRef);
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[new project error] ${(error as Error).message}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    open,
    projectName,
    workspaceDir,
    projectType,
    useAcp,
    selectedAcpBridgeId,
    projectNameTouched,
    submitting,
    begin,
    close: () => setOpen(false),
    submit,
    setProjectName,
    setWorkspaceDir,
    setProjectType,
    setUseAcp,
    setSelectedAcpBridgeId,
    setProjectNameTouched,
  };
}

export type AgentProjectCreateRuntime = ReturnType<typeof useAgentProjectCreate>;

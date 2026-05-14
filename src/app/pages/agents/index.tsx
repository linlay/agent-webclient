import { useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/app/state/types";
import { AgentList } from "@/features/workers/components/AgentList";
import { getAgents, setAccessToken } from "@/features/transport/lib/apiClientProxy";
import { useI18n } from "@/shared/i18n";
import { isAppMode } from "@/shared/utils/routing";

export const AgentsPage = () => {
  const { state, dispatch, stateRef } = useAppContext();
  const { t } = useI18n();
  const initialLoadStartedRef = useRef(false);

  useEffect(() => {
    if (initialLoadStartedRef.current) {
      return;
    }
    if (isAppMode() && !String(state.accessToken || "").trim()) {
      return;
    }

    initialLoadStartedRef.current = true;
    setAccessToken(stateRef.current.accessToken);
    getAgents()
      .then((response) => {
        const agents = Array.isArray(response.data)
          ? (response.data as Agent[])
          : [];
        dispatch({ type: "SET_AGENTS", agents });
      })
      .catch((error) => {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[loadAgents error] ${(error as Error).message}`,
        });
      });
  }, [dispatch, state.accessToken, stateRef]);

  const agentCount = useMemo(
    () => (Array.isArray(state.agents) ? state.agents.length : 0),
    [state.agents],
  );

  return (
    <main className="agents-page">
      <div className="agents-page-head">
        <div>
          <h1>{t("agents.page.title")}</h1>
          <p>{t("agents.page.count", { count: agentCount })}</p>
        </div>
      </div>
      <AgentList
        agents={state.agents}
        selectedAgentKey={state.pendingNewChatAgentKey}
      />
    </main>
  );
};

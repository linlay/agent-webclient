import React from "react";
import { Select, Spin } from "antd";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Agent, WorkerListItem } from "@/app/state/navigationTypes";
import { ProjectWorkspace } from "@/features/project/components/ProjectWorkspace";
import {
  buildProjectRoute,
  readProjectRouteState,
  type ProjectRouteState,
} from "@/features/project/lib/projectRoute";
import { getAgents } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

function isProjectAgent(item: WorkerListItem): item is Agent {
  const mode = String(item.mode || "").trim().toUpperCase();
  return "key" in item && (mode === "CODER" || mode === "KBASE");
}

export const ProjectPage: React.FC = () => {
  const { t } = useI18n();
  const params = useParams<{ agentKey: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const route = React.useMemo(
    () => readProjectRouteState(searchParams.toString(), params.agentKey),
    [params.agentKey, searchParams],
  );
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    void getAgents({ mode: ["CODER", "KBASE"], includeChats: 20, scope: "nav" })
      .then((response) => {
        if (disposed) return;
        const byKey = new Map<string, Agent>();
        const items = Array.isArray(response.data) ? response.data as WorkerListItem[] : [];
        items.filter(isProjectAgent).forEach((agent) => byKey.set(agent.key, agent));
        setAgents(Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, []);

  const selectedAgent = agents.find((agent) => agent.key === route.agentKey);

  const navigateState = React.useCallback((state: ProjectRouteState, replace = false) => {
    const url = buildProjectRoute(state);
    if (!url) return;
    const nextAgentKey = String(state.agentKey || "").trim();
    if (nextAgentKey && nextAgentKey !== String(params.agentKey || "").trim()) {
      navigate(url, { replace });
      return;
    }
    const query = url.split("?", 2)[1] || "";
    setSearchParams(query, { replace });
  }, [navigate, params.agentKey, setSearchParams]);

  const selectAgent = (agentKey: string) => {
    const agent = agents.find((item) => item.key === agentKey);
    const latestChat = [...(agent?.chats || [])]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
    navigateState({
      agentKey,
      chatId: latestChat?.chatId,
      runId: latestChat?.lastRunId,
      view: "content",
    });
  };

  const agentSelector = (
    <Select
      className="project-agent-select"
      showSearch
      optionFilterProp="label"
      value={route.agentKey}
      placeholder={t("project.page.selectAgent")}
      options={agents.map((agent) => ({
        value: agent.key,
        label: `${agent.name} · ${String(agent.mode || "").toUpperCase()}`,
      }))}
      onChange={selectAgent}
    />
  );

  return (
    <main className="project-page">
      {selectedAgent ? (
        <div className="project-page-workspace is-selected">
          <ProjectWorkspace
            key={selectedAgent.key}
            agentKey={selectedAgent.key}
            agentName={selectedAgent.name}
            chats={selectedAgent.chats || []}
            chatId={route.chatId}
            runId={route.runId}
            path={route.path}
            openFiles={route.openFiles}
            view={route.view}
            polling
            agentSelector={agentSelector}
            onStateChange={(state) => navigateState(state)}
          />
        </div>
      ) : (
        <>
          <header className="project-page-header">
            <h1>{t("project.page.title")}</h1>
            <span>{t("project.page.subtitle")}</span>
            <span className="project-page-header-spacer" />
            {agentSelector}
          </header>
          <div className="project-page-workspace">
            {loading ? (
              <div className="project-page-state">
                <Spin />
                {t("project.page.loading")}
              </div>
            ) : error ? (
              <div className="project-page-state is-error">
                {t("project.page.loadError", { detail: error })}
              </div>
            ) : (
              <div className="project-page-state project-page-picker">
                <MaterialIcon name="folder_open" />
                <strong>{agents.length ? t("project.page.selectAgent") : t("project.page.noAgents")}</strong>
                {agents.length ? (
                  <div className="project-agent-cards">
                    {agents.map((agent) => (
                      <button type="button" key={agent.key} onClick={() => selectAgent(agent.key)}>
                        <MaterialIcon name={String(agent.mode).toUpperCase() === "KBASE" ? "book_2" : "code"} />
                        <span>{agent.name}</span>
                        <small>{String(agent.mode || "").toUpperCase()}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
};

import React from "react";
import { Select, Spin } from "antd";
import { ProjectWorkspace } from "@/features/project/components/ProjectWorkspace";
import type { ProjectRouteState } from "@/features/project/lib/projectRoute";
import { useProjectAgents } from "@/features/project/hooks/useProjectAgents";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

interface ProjectConsoleProps {
  route: ProjectRouteState;
  onStateChange: (state: ProjectRouteState, replace?: boolean) => void;
}

export const ProjectConsole: React.FC<ProjectConsoleProps> = ({ route, onStateChange }) => {
  const { t } = useI18n();
  const { agents, error, loading } = useProjectAgents();
  const selectedAgent = agents.find((agent) => agent.key === route.agentKey);

  const selectAgent = (agentKey: string) => {
    const agent = agents.find((item) => item.key === agentKey);
    const latestChat = [...(agent?.chats || [])]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
    onStateChange({
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
            onStateChange={onStateChange}
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
              <div className="project-page-state"><Spin />{t("project.page.loading")}</div>
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

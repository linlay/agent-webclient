import React from "react";
import { Spin } from "antd";
import { ProjectWorkspace } from "@/features/project/components/ProjectWorkspace";
import type { ProjectRouteState } from "@/features/project/lib/projectRoute";
import { useProjectAgent } from "@/features/project/hooks/useProjectAgent";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

interface ProjectConsoleProps {
  route: ProjectRouteState;
  onStateChange: (state: ProjectRouteState, replace?: boolean) => void;
}

export const ProjectConsole: React.FC<ProjectConsoleProps> = ({ route, onStateChange }) => {
  const { t } = useI18n();
  const { agent, chats, chatsError, error, loading } = useProjectAgent(route.agentKey);

  return (
    <main className="project-page">
      {agent && route.agentKey ? (
        <div className="project-page-workspace is-selected">
          <ProjectWorkspace
            key={route.agentKey}
            agentKey={route.agentKey}
            agentName={agent.name}
            chats={chats}
            chatListError={chatsError ? t("project.context.loadError", { detail: chatsError }) : undefined}
            chatId={route.chatId}
            runId={route.runId}
            path={route.path}
            openFiles={route.openFiles}
            view={route.view}
            polling
            onStateChange={onStateChange}
          />
        </div>
      ) : (
        <>
          <header className="project-page-header">
            <h1>{t("project.page.title")}</h1>
            <span>{t("project.page.subtitle")}</span>
          </header>
          <div className="project-page-workspace">
            {loading ? (
              <div className="project-page-state"><Spin />{t("project.page.loading")}</div>
            ) : error ? (
              <div className="project-page-state is-error">
                {t("project.page.loadError", { detail: error })}
              </div>
            ) : (
              <div className="project-page-state">
                <MaterialIcon name="folder_open" />
                <strong>{t(route.agentKey ? "project.page.noWorkspace" : "project.page.missingContext")}</strong>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
};

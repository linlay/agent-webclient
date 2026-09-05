import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ProjectConsole } from "@/features/project/components/ProjectConsole";
import {
  buildProjectRoute,
  readProjectRouteState,
  type ProjectRouteState,
} from "@/features/project/lib/projectRoute";

export const ProjectPage: React.FC = () => {
  const params = useParams<{ agentKey: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const route = React.useMemo(
    () => readProjectRouteState(searchParams.toString(), params.agentKey),
    [params.agentKey, searchParams],
  );
  const updateRoute = React.useCallback((state: ProjectRouteState, replace = false) => {
    const url = buildProjectRoute(state);
    if (!url) return;
    const nextAgentKey = String(state.agentKey || "").trim();
    if (nextAgentKey && nextAgentKey !== String(params.agentKey || "").trim()) {
      navigate(url, { replace });
      return;
    }
    setSearchParams(url.split("?", 2)[1] || "", { replace });
  }, [navigate, params.agentKey, setSearchParams]);

  return <ProjectConsole route={route} onStateChange={updateRoute} />;
};

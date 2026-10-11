import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ProjectConsole } from "@/features/project/components/ProjectConsole";
import {
  buildProjectRoute,
  readProjectRouteState,
  type ProjectRouteState,
} from "@/features/project/lib/projectRoute";

export const ProjectPage: React.FC = () => {
  const params = useParams<{ agentKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const route = React.useMemo(
    () => readProjectRouteState(searchParams.toString(), params.agentKey),
    [params.agentKey, searchParams],
  );
  const updateRoute = React.useCallback((state: ProjectRouteState, replace = false) => {
    const url = buildProjectRoute({ ...state, agentKey: params.agentKey });
    if (!url) return;
    setSearchParams(url.split("?", 2)[1] || "", { replace });
  }, [params.agentKey, setSearchParams]);

  return <ProjectConsole route={route} onStateChange={updateRoute} />;
};

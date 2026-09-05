import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { AutomationHistoryConsole } from "@/features/automations/components/AutomationHistoryConsole";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

export const AutomationsRouteContent: React.FC = () => {
  const state = useAppState();
  const currentWorker = React.useMemo(() => resolveCurrentWorkerSummary(state), [state]);
  return (
    <AutomationHistoryConsole
      currentWorker={currentWorker}
      agents={state.agents}
      teams={state.teams}
    />
  );
};

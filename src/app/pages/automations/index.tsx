import { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { AutomationHistoryConsole } from "@/features/automations/components/AutomationHistoryConsole";

export const AutomationsPage = () => {
  const state = useAppState();
  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  return (
    <main className="automations-page automations-console-page">
      <AutomationHistoryConsole
        currentWorker={currentWorker}
        agents={state.agents}
        teams={state.teams}
      />
    </main>
  );
};

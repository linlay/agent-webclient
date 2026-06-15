import { AutomationModal } from "@/app/modals/AutomationModal";
import { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

export const AutomationsPage = () => {
  const state = useAppState();
  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  return (
    <main className="automations-page automations-console-page">
      <AutomationModal
        currentWorker={currentWorker}
        agents={state.agents}
        teams={state.teams}
      />
    </main>
  );
};

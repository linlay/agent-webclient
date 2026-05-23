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
    <div
      style={{ padding: 10, background: "var(--bg-elev-2)", height: "100vh", overflow: "auto" }}
    >
      <AutomationModal
        currentWorker={currentWorker}
        agents={state.agents}
        teams={state.teams}
      />
    </div>
  );
};

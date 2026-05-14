import { ScheduleModal } from "@/app/modals/ScheduleModal";
import { useMemo } from "react";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

export const SchedulesPage = () => {
  const state = useAppState();
  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  return (
    <div style={{padding: 20}}>
      <ScheduleModal
        currentWorker={currentWorker}
        agents={state.agents}
        teams={state.teams}
      />
    </div>
  );
};

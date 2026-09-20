import { useEffect, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { getAgent } from "@/shared/data";
import { interactionDefaults, pendingInteraction, type InteractionConfig } from "@/shared/contracts/interaction";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

export function useAgentInteraction(worker: CurrentWorkerSummary | null): InteractionConfig {
  const { dispatch, stateRef } = useAppContext();
  const key = worker?.type === "agent" ? worker.sourceId : "";
  const embedded = worker?.raw?.interactionConfig as InteractionConfig | undefined;
  const [loaded, setLoaded] = useState<{key: string; config: InteractionConfig} | null>(null);
  useEffect(() => {
    if (!key || embedded) return;
    let canceled = false;
    void getAgent(key).then(({data}) => {
      if (!canceled) {
        const config = data.interactionConfig || interactionDefaults(data.mode);
        setLoaded({key, config});
        dispatch({type: "SET_AGENTS", agents: stateRef.current.agents.map(agent =>
          agent.key === key ? {
            ...agent,
            interactionConfig: config,
            definition: data.definition ?? agent.definition,
            modelConfig: data.modelConfig ?? agent.modelConfig,
            ...(data.modelOptions ? {modelOptions: {...data.modelOptions}} : {}),
            meta: data.meta ?? agent.meta,
          } : agent)});
      }
    }).catch(() => { if (!canceled) setLoaded(null); });
    return () => { canceled = true; };
  }, [key, embedded, dispatch, stateRef]);
  if (worker?.type === "team") return interactionDefaults("TEAM");
  return embedded || (loaded?.key === key ? loaded.config : pendingInteraction);
}

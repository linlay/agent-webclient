import { useEffect, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { getAgent } from "@/shared/data";
import { pendingInteraction, type InteractionConfig } from "@/shared/contracts/interaction";
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
        // The Platform resolves mode defaults. A detail without the config is a
        // settled answer (everything off), distinct from still loading.
        const config = data.interactionConfig || {...pendingInteraction};
        setLoaded({key, config});
        dispatch({type: "SET_AGENTS", agents: stateRef.current.agents.map(agent =>
          agent.key === key ? {
            ...agent,
            interactionConfig: config,
            modelKey: data.modelKey,
            reasoningEffort: data.reasoningEffort,
            serviceTier: data.serviceTier,
            definition: data.definition ?? agent.definition,
            skills: data.skills,
            meta: data.meta ?? agent.meta,
          } : agent)});
      }
    }).catch(() => { if (!canceled) setLoaded(null); });
    return () => { canceled = true; };
  }, [key, embedded, dispatch, stateRef]);

  return embedded || (loaded?.key === key ? loaded.config : pendingInteraction);
}

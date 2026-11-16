import { isEmbedMode } from "@/shared/config/embed";
import { getEmbedOptions } from "@/shared/data/embed/embedSession";
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
        dispatch({ type: "SET_CURRENT_AGENT", agent: { ...data } as unknown as import("@/features/agents/lib/agentState").Agent });
      }
    }).catch(() => { if (!canceled) setLoaded(null); });
    return () => { canceled = true; };
  }, [key, embedded, dispatch, stateRef]);

  const resolved = embedded || (loaded?.key === key ? loaded.config : pendingInteraction);
  const config = !isEmbedMode() || resolved === pendingInteraction ? resolved : {
    ...resolved, connectors: false, showTerminal: false,
    attachment: { ...resolved.attachment, chatRecords: false, skills: false, kbases: false,
      localFiles: resolved.attachment.localFiles && getEmbedOptions().features?.attachments === true },
  };
  const state = stateRef.current;
  const agent = state.currentAgent?.key === key ? state.currentAgent : null;
  if (String(agent?.mode || worker?.raw?.mode || "").toUpperCase() !== "BOT") return config;
  const chat = state.chats.find(item => item.chatId === state.chatId);
  const navigationAgent = state.agents.find(item => item.key === key);
  const main = !state.chatId || chat?.primary === true || navigationAgent?.primaryChat?.chatId === state.chatId;
  return { ...config, showPlanningMode: false, showTerminal: false,
    ...(main ? { model: false, showEditingMode: false } : {}) };

}

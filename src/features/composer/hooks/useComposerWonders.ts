import { useEffect, useRef, useState } from "react";
import { useMemo } from "react";
import type { AppState } from "@/app/state/types";
import { getAgent } from "@/features/transport/lib/apiClientProxy";
import {
  normalizeWonders,
  pickRandomWonders,
} from "@/features/composer/lib/wonders";

interface UseComposerWondersInput {
  agents: AppState["agents"];
  currentAgentKey: string;
  isBlankConversation: boolean;
}

export function useComposerWonders(input: UseComposerWondersInput) {
  const { agents, currentAgentKey, isBlankConversation } = input;
  const blankWonderSignatureRef = useRef("");
  const wasBlankConversationRef = useRef(false);
  const [agentWonderCache, setAgentWonderCache] = useState<
    Record<string, string[]>
  >({});
  const [sampledWonders, setSampledWonders] = useState<string[]>([]);

  const currentAgentWonders = useMemo(() => {
    if (!currentAgentKey) {
      return [];
    }
    const agent = agents.find(
      (item) => String(item?.key || "").trim() === currentAgentKey,
    );
    const fromState = normalizeWonders(agent?.wonders);
    if (fromState.length > 0) {
      return fromState;
    }
    return agentWonderCache[currentAgentKey] || [];
  }, [agentWonderCache, agents, currentAgentKey]);

  useEffect(() => {
    if (!currentAgentKey) {
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(agentWonderCache, currentAgentKey)
    ) {
      return;
    }

    let cancelled = false;
    void getAgent(currentAgentKey)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const payload = (response.data || {}) as { wonders?: unknown };
        const wonders = normalizeWonders(payload.wonders);
        setAgentWonderCache((current) => {
          if (Object.prototype.hasOwnProperty.call(current, currentAgentKey)) {
            return current;
          }
          return {
            ...current,
            [currentAgentKey]: wonders,
          };
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setAgentWonderCache((current) => {
          if (Object.prototype.hasOwnProperty.call(current, currentAgentKey)) {
            return current;
          }
          return {
            ...current,
            [currentAgentKey]: [],
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [agentWonderCache, currentAgentKey]);

  useEffect(() => {
    const signature = currentAgentKey
      ? `${currentAgentKey}\u0000${currentAgentWonders.join("\u0001")}`
      : "";
    const shouldShowWonders =
      isBlankConversation && signature !== "" && currentAgentWonders.length > 0;

    if (!shouldShowWonders) {
      if (sampledWonders.length > 0) {
        setSampledWonders([]);
      }
      blankWonderSignatureRef.current = "";
      wasBlankConversationRef.current = false;
      return;
    }

    if (
      !wasBlankConversationRef.current ||
      blankWonderSignatureRef.current !== signature
    ) {
      setSampledWonders(pickRandomWonders(currentAgentWonders, 3));
      blankWonderSignatureRef.current = signature;
    }
    wasBlankConversationRef.current = true;
  }, [
    currentAgentKey,
    currentAgentWonders,
    isBlankConversation,
    sampledWonders.length,
  ]);

  return {
    agentWonderCache,
    sampledWonders,
    setAgentWonderCache,
    setSampledWonders,
  };
}

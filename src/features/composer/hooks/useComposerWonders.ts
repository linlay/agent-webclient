import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/app/state/AppContext";
import { useAgentWelcome } from "@/features/agents/hooks/useAgentWelcome";
import {
  normalizeWonders,
  pickRandomWonders,
} from "@/features/composer/lib/wonders";

interface UseComposerWondersInput {
  currentAgent: AppState["currentAgent"];
  currentAgentKey: string;
  isBlankConversation: boolean;
  showWonders?: boolean;
}

export function shouldLoadComposerAgentDetails(
  currentAgentKey: string,
  isBlankConversation: boolean,
): boolean {
  return Boolean(currentAgentKey && isBlankConversation);
}

export function useComposerWonders(input: UseComposerWondersInput) {
  const { currentAgent, currentAgentKey, isBlankConversation, showWonders = true } = input;
  const blankWonderSignatureRef = useRef("");
  const wasBlankConversationRef = useRef(false);
  const [sampledWonders, setSampledWonders] = useState<string[]>([]);
  const { introduction: sampledIntroduction, detail } = useAgentWelcome(currentAgentKey, isBlankConversation);

  const currentAgentWonders = useMemo(() => {
    if (!currentAgentKey) {
      return [];
    }
    const agent = currentAgent?.key === currentAgentKey ? currentAgent : null;
    const fromState = normalizeWonders(agent?.wonders);
    if (fromState.length > 0) {
      return fromState;
    }
    return normalizeWonders(detail?.wonders);
  }, [detail, currentAgent, currentAgentKey]);

  useEffect(() => {
    const signature = currentAgentKey
      ? `${currentAgentKey}\u0000${currentAgentWonders.join("\u0001")}`
      : "";
    const shouldShowWonders =
      showWonders && isBlankConversation && signature !== "" && currentAgentWonders.length > 0;

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
    showWonders,
  ]);

  const reshuffleWonders = useCallback(() => {
    if (currentAgentWonders.length > 0) {
      setSampledWonders(pickRandomWonders(currentAgentWonders, 3));
    }
  }, [currentAgentWonders]);

  return { currentAgentWonders, sampledIntroduction, sampledWonders, reshuffleWonders };
}

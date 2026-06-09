import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/app/state/types";
import { getAgent } from "@/features/transport/lib/apiClientProxy";
import {
  normalizeGreetings,
  normalizeWonders,
  pickRandomGreeting,
  pickRandomWonders,
} from "@/features/composer/lib/wonders";

interface UseComposerWondersInput {
  agents: AppState["agents"];
  currentAgentKey: string;
  isBlankConversation: boolean;
  showWonders?: boolean;
}

export function useComposerWonders(input: UseComposerWondersInput) {
  const { agents, currentAgentKey, isBlankConversation, showWonders = true } = input;
  const blankWonderSignatureRef = useRef("");
  const blankGreetingSignatureRef = useRef("");
  const wasBlankConversationRef = useRef(false);
  const wasBlankGreetingConversationRef = useRef(false);
  const [agentWonderCache, setAgentWonderCache] = useState<
    Record<string, string[]>
  >({});
  const [agentGreetingCache, setAgentGreetingCache] = useState<
    Record<string, string[]>
  >({});
  const [sampledWonders, setSampledWonders] = useState<string[]>([]);
  const [sampledGreeting, setSampledGreeting] = useState("");

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

  const currentAgentGreetings = useMemo(() => {
    if (!currentAgentKey) {
      return [];
    }
    return agentGreetingCache[currentAgentKey] || [];
  }, [agentGreetingCache, currentAgentKey]);

  useEffect(() => {
    if (!currentAgentKey) {
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(agentWonderCache, currentAgentKey)
      && Object.prototype.hasOwnProperty.call(agentGreetingCache, currentAgentKey)
    ) {
      return;
    }

    let cancelled = false;
    void getAgent(currentAgentKey)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const payload = (response.data || {}) as {
          greetings?: unknown;
          wonders?: unknown;
        };
        const greetings = normalizeGreetings(payload.greetings);
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
        setAgentGreetingCache((current) => {
          if (Object.prototype.hasOwnProperty.call(current, currentAgentKey)) {
            return current;
          }
          return {
            ...current,
            [currentAgentKey]: greetings,
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
        setAgentGreetingCache((current) => {
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
  }, [agentGreetingCache, agentWonderCache, currentAgentKey]);

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

  useEffect(() => {
    const signature = currentAgentKey
      ? `${currentAgentKey}\u0000${currentAgentGreetings.join("\u0001")}`
      : "";
    const shouldShowGreeting =
      isBlankConversation && signature !== "" && currentAgentGreetings.length > 0;

    if (!shouldShowGreeting) {
      if (sampledGreeting) {
        setSampledGreeting("");
      }
      blankGreetingSignatureRef.current = "";
      wasBlankGreetingConversationRef.current = false;
      return;
    }

    if (
      !wasBlankGreetingConversationRef.current ||
      blankGreetingSignatureRef.current !== signature
    ) {
      setSampledGreeting(pickRandomGreeting(currentAgentGreetings));
      blankGreetingSignatureRef.current = signature;
    }
    wasBlankGreetingConversationRef.current = true;
  }, [
    currentAgentGreetings,
    currentAgentKey,
    isBlankConversation,
    sampledGreeting,
  ]);

  const reshuffleWonders = useCallback(() => {
    if (currentAgentWonders.length > 0) {
      setSampledWonders(pickRandomWonders(currentAgentWonders, 3));
    }
  }, [currentAgentWonders]);

  return {
    agentGreetingCache,
    agentWonderCache,
    currentAgentWonders,
    sampledGreeting,
    sampledWonders,
    setAgentGreetingCache,
    setAgentWonderCache,
    setSampledGreeting,
    setSampledWonders,
    reshuffleWonders,
  };
}

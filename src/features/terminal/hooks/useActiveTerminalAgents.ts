import { useEffect, useState } from "react";
import { getTerminalSessions } from "@/shared/data";
import type { TerminalSessionInfo } from "@/shared/data/client";
import { getClientDeviceId } from "@/features/transport/lib/clientDeviceId";
import { toText } from "@/shared/utils/eventUtils";

const TERMINAL_ACTIVITY_EVENT = "agent-webclient:terminal-activity";
const TERMINAL_ACTIVITY_REFRESH_MS = 5000;

let activeAgentKeys = new Set<string>();
let inFlightRefresh: Promise<void> | null = null;

const subscribers = new Set<(agentKeys: ReadonlySet<string>) => void>();

export function terminalBusyAgentKeysFromSessions(
  sessions: readonly TerminalSessionInfo[],
): Set<string> {
  const next = new Set<string>();
  for (const session of sessions) {
    if (toText(session.status) !== "busy") {
      continue;
    }
    const agentKey = toText(session.agentKey);
    if (agentKey) {
      next.add(agentKey);
    }
  }
  return next;
}

function publish(agentKeys: Set<string>): void {
  activeAgentKeys = agentKeys;
  for (const subscriber of subscribers) {
    subscriber(activeAgentKeys);
  }
}

async function refreshTerminalActivity(): Promise<void> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }
  inFlightRefresh = getTerminalSessions(getClientDeviceId())
    .then((response) => {
      publish(terminalBusyAgentKeysFromSessions(response.data?.sessions || []));
    })
    .catch(() => {
      publish(new Set());
    })
    .finally(() => {
      inFlightRefresh = null;
    });
  return inFlightRefresh;
}

export function notifyTerminalActivityChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TERMINAL_ACTIVITY_EVENT));
    return;
  }
  void refreshTerminalActivity();
}

export function useActiveTerminalAgents(): ReadonlySet<string> {
  const [agentKeys, setAgentKeys] = useState<ReadonlySet<string>>(activeAgentKeys);

  useEffect(() => {
    const subscriber = (next: ReadonlySet<string>) => setAgentKeys(new Set(next));
    subscribers.add(subscriber);
    subscriber(activeAgentKeys);
    if (typeof window === "undefined") {
      return () => {
        subscribers.delete(subscriber);
      };
    }

    const handleRefresh = () => {
      void refreshTerminalActivity();
    };
    const handleFocus = () => {
      void refreshTerminalActivity();
    };
    window.addEventListener(TERMINAL_ACTIVITY_EVENT, handleRefresh);
    window.addEventListener("focus", handleFocus);
    const interval = window.setInterval(
      () => void refreshTerminalActivity(),
      TERMINAL_ACTIVITY_REFRESH_MS,
    );
    void refreshTerminalActivity();

    return () => {
      subscribers.delete(subscriber);
      window.removeEventListener(TERMINAL_ACTIVITY_EVENT, handleRefresh);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(interval);
    };
  }, []);

  return agentKeys;
}

export function resetTerminalActivityForTests(): void {
  activeAgentKeys = new Set();
  inFlightRefresh = null;
  subscribers.clear();
}

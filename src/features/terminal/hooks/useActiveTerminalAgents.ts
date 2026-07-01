import { useEffect, useMemo, useState } from "react";
import {
  ensureTerminalStatusStream,
  getTerminalAgentStatuses,
  subscribeTerminalActivity,
  type TerminalAgentTerminalStatus,
} from "@/features/terminal/lib/terminalStatusActivity";

export {
  getTerminalAgentStatuses,
  notifyTerminalActivityChanged,
  resetTerminalActivityForTests,
  terminalAgentKeysFromStatusEvent,
  terminalAgentKeysFromStatusSessions,
  terminalAgentStatusesFromStatusEvent,
  terminalAgentStatusesFromStatusSessions,
  terminalBusyAgentKeysFromStatusEvent,
  terminalBusyAgentKeysFromStatusSessions,
  terminalStatusSessionsFromEvent,
  type TerminalAgentTerminalStatus,
  type TerminalStatusEventLike,
  type TerminalStatusSession,
} from "@/features/terminal/lib/terminalStatusActivity";

export function useTerminalAgentStatuses(): ReadonlyMap<
  string,
  TerminalAgentTerminalStatus
> {
  const [agentStatuses, setAgentStatuses] = useState<
    ReadonlyMap<string, TerminalAgentTerminalStatus>
  >(
    () =>
      new Map<string, TerminalAgentTerminalStatus>(
        getTerminalAgentStatuses(),
      ),
  );

  useEffect(() => {
    const unsubscribe = subscribeTerminalActivity((next) => {
      setAgentStatuses(new Map(next));
    });

    if (typeof window === "undefined") {
      return unsubscribe;
    }

    const handleFocus = () => {
      void ensureTerminalStatusStream();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      unsubscribe();
    };
  }, []);

  return agentStatuses;
}

export function useActiveTerminalAgents(): ReadonlySet<string> {
  const agentStatuses = useTerminalAgentStatuses();
  return useMemo(() => new Set(agentStatuses.keys()), [agentStatuses]);
}

export function useBusyTerminalAgents(): ReadonlySet<string> {
  const agentStatuses = useTerminalAgentStatuses();
  return useMemo(() => {
    const next = new Set<string>();
    for (const [agentKey, status] of agentStatuses) {
      if (status === "busy") {
        next.add(agentKey);
      }
    }
    return next;
  }, [agentStatuses]);
}

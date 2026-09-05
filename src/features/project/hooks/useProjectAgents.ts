import React from "react";
import type { Agent, WorkerListItem } from "@/app/state/navigationTypes";
import { getAgents } from "@/shared/data";

function isProjectAgent(item: WorkerListItem): item is Agent {
  const mode = String(item.mode || "").trim().toUpperCase();
  return "key" in item && (mode === "CODER" || mode === "KBASE");
}

export function useProjectAgents() {
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    void getAgents({ mode: ["CODER", "KBASE"], includeChats: 20, scope: "nav" })
      .then((response) => {
        if (disposed) return;
        const byKey = new Map<string, Agent>();
        const items = Array.isArray(response.data) ? response.data as WorkerListItem[] : [];
        items.filter(isProjectAgent).forEach((agent) => byKey.set(agent.key, agent));
        setAgents(Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  return { agents, error, loading };
}

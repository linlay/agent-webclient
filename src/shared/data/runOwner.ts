export type RunOwner =
  | {
      kind: "agent";
      agentKey: string;
    }
  | {
      kind: "orchestrated-team";
      teamId: string;
    };

export interface RunOwnerIdentity {
  agentKey?: unknown;
  teamId?: unknown;
}

/** A teamId always wins over a stale or presentation-only member agentKey. */
export function toRunOwner(value: RunOwnerIdentity | null | undefined): RunOwner | null {
  const teamId = String(value?.teamId || "").trim();
  if (teamId) {
    return { kind: "orchestrated-team", teamId };
  }

  const agentKey = String(value?.agentKey || "").trim();
  return agentKey ? { kind: "agent", agentKey } : null;
}

export function runOwnerPayload(owner: RunOwner): { agentKey: string } | { teamId: string } {
  return owner.kind === "orchestrated-team"
    ? { teamId: owner.teamId }
    : { agentKey: owner.agentKey };
}

export function sameRunOwner(left: RunOwner | null | undefined, right: RunOwner | null | undefined): boolean {
  if (!left || !right || left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "agent" && right.kind === "agent") {
    return left.agentKey === right.agentKey;
  }
  if (left.kind === "orchestrated-team" && right.kind === "orchestrated-team") {
    return left.teamId === right.teamId;
  }
  return false;
}

export type RunOwner = { kind: "agent"; agentKey: string };
export interface RunOwnerIdentity { agentKey?: unknown; }
export function toRunOwner(value: RunOwnerIdentity | null | undefined): RunOwner | null {
 const agentKey = String(value?.agentKey || "").trim();
 return agentKey ? { kind: "agent", agentKey } : null;
}
export function runOwnerPayload(owner: RunOwner): { agentKey: string } {
 return { agentKey: owner.agentKey };
}
export function sameRunOwner(left: RunOwner | null | undefined, right: RunOwner | null | undefined): boolean {
 return Boolean(left && right && left.agentKey === right.agentKey);
}

import type { TimelineNode } from "./timelineState";
export interface QueryResendSnapshot { mustUseKbases: string[] }
export function queryResendSnapshot(node: Pick<TimelineNode, "mustUseKbases">): QueryResendSnapshot {
 return {mustUseKbases: [...(node.mustUseKbases || [])]};
}

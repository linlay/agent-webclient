import type { TimelineNode } from "./timelineState";

/** Preserve chronology while folding only consecutive execution details. */
export function runPresentationSections(nodes: readonly TimelineNode[]) {
  const finalAnswer = nodes.findLast(node => node.kind === "content" && !node.taskId);
  const sections: Array<{ key: string; process: boolean; nodes: TimelineNode[] }> = [];
  for (const node of nodes) {
    const process = !(node === finalAnswer || node.kind === "awaiting-answer" ||
      (node.kind === "message" && (node.role === "user" || node.systemMessageLevel === "error")));
    const last = sections[sections.length - 1];
    if (last && last.process === process) last.nodes.push(node);
    else sections.push({ key: node.id, process, nodes: [node] });
  }
  return sections;
}

import type { TimelineNode } from "./timelineState";
import type { TaskItemMeta } from "@/features/tasks/lib/tasksState";
import { isImageGenerationTool } from "./imageGenerationDisplay";
import { buildRunRenderEntries, type TimelineRenderEntry } from "./timelineDisplay";

/** Keep snapshot interactions in order and outside nested task groups. */
export function buildDocumentRunSections(nodes: readonly TimelineNode[], tasks?: Map<string, TaskItemMeta>) {
  const finalAnswer = nodes.findLast(node => node.kind === "content" && !node.taskId);
  const sections: Array<{ kind: "result" | "interaction" | "process"; nodes: TimelineNode[] }> = [];
  for (const node of nodes) {
    const isResult = node === finalAnswer || (!node.taskId && isImageGenerationTool(node)) ||
      (node.kind === "message" && node.systemMessageLevel === "error" && !node.taskId);
    const isInteraction = node.kind === "awaiting-answer" || (node.kind === "message" && node.role === "user");
    const kind = isResult ? "result" : isInteraction ? "interaction" : "process";
    const last = sections[sections.length - 1];
    if (last?.kind === kind) last.nodes.push(node);
    else sections.push({ kind, nodes: [node] });
  }
  return sections.map(section => {
    const entries = section.kind === "interaction"
      ? section.nodes.map<TimelineRenderEntry>(node => ({ kind: "node", key: `node_${node.id}`, node }))
      : buildRunRenderEntries(section.nodes, tasks);
    const hasProcess = section.kind !== "result" && section.nodes.some(node => !isImageGenerationTool(node));
    const collapsedEntries = !hasProcess ? entries : entries.flatMap(entry => {
      if (entry.kind !== "task-group") return [];
      // Show a task's images without splitting its execution into separate groups.
      const images = entry.renderEntries.filter(child => child.kind === "tool-group" && child.nodes.some(isImageGenerationTool));
      return images.length ? [{ ...entry, renderEntries: images }] : [];
    });
    return { entries, collapsedEntries, hasProcess };
  });
}

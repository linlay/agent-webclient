import type { BTWSessionState } from "@/features/btw/lib/btwTypes";

export function getLatestBtwAnswer(
  session: BTWSessionState | null | undefined,
): string {
  if (!session) return "";
  const { timelineOrder, timelineNodes } = session.projection;
  for (let index = timelineOrder.length - 1; index >= 0; index -= 1) {
    const node = timelineNodes.get(timelineOrder[index]);
    if (node?.kind === "content" && String(node.text || "").trim()) {
      return String(node.text || "");
    }
  }
  return "";
}

export function canResetBtwBranch(
  session: BTWSessionState | null | undefined,
): boolean {
  return Boolean(
    session?.btwId ||
      session?.error ||
      (session?.projection.timelineOrder.length ?? 0) > 0,
  );
}

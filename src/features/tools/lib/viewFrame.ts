import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";
import type { AIAwaitSubmitPayloadData } from "@/shared/contracts/agentEvents";

// Every form awaiting, including a Team member's, carries its own view.
export function awaitingViewFrame(data: FormActiveAwaiting, index: number) {
  return { awaiting: data, index };
}

export function acceptsViewSubmit(collecting: boolean, currentKey: string, expectedKey: string): boolean {
  return collecting && currentKey === expectedKey;
}

export function wrapViewFrameSubmit(data: FormActiveAwaiting, frame: ReturnType<typeof awaitingViewFrame>, payload: AIAwaitSubmitPayloadData): AIAwaitSubmitPayloadData | null {
  const ids = new Set(frame.awaiting.forms.map(form => form.id));
  const seen = new Set<string>();
  for (const param of payload.params) {
    if (!param.id || !ids.has(param.id) || seen.has(param.id)) return null;
    seen.add(param.id);
  }
  if (!payload.params.length) return null;
  return { ...payload, runId: data.runId, awaitingId: data.awaitingId };
}

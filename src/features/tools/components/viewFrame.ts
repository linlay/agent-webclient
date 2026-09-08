import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";
import type { AIAwaitFormSubmitParamData, AIAwaitSubmitPayloadData } from "@/shared/contracts/agentEvents";
import { readViewReference } from "@/shared/contracts/view";

// Team forms contain a member's original definition. A member VIEW receives
// only that definition; the host retains the routing identity and other members.
export function awaitingViewFrame(data: FormActiveAwaiting, index: number) {
  const outer = data.forms[index];
  const child = outer?.form;
  const ref = !data.view && child?.mode === "form" ? readViewReference(child.view) : undefined;
  if (!ref || !Array.isArray(child?.forms)) return { awaiting: data, index, outerId: undefined as string | undefined };
  const saved = new Map((Array.isArray(child.params) ? child.params : []).map((p: AIAwaitFormSubmitParamData) => [p.id, p.form]));
  const forms = child.forms.map((form: FormActiveAwaiting["forms"][number]) => ({ ...form, ...(saved.has(form.id) ? { form: saved.get(form.id) } : {}) }));
  const awaiting: FormActiveAwaiting = { ...data, key: `${data.key}:${outer.id}`, view: ref,
    viewError: typeof child.viewError === "string" ? child.viewError : undefined,
    awaitingId: String(child.awaitingId || data.awaitingId), viewportKey: ref.key, forms,
    viewportHtml: "", loading: false, loadError: "" };
  return { awaiting, index: 0, outerId: outer.id };
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
  if (!frame.outerId) return { ...payload, runId: data.runId, awaitingId: data.awaitingId };
  const outer = data.forms.find(form => form.id === frame.outerId)!;
  const submitted = new Map((payload.params as AIAwaitFormSubmitParamData[]).map(param => [param.id, param]));
  const params = frame.awaiting.forms.map(form => submitted.get(form.id) || { id: form.id, decision: "approve" as const, form: form.form || {} });
  return { runId: data.runId, awaitingId: data.awaitingId,
    params: [{ id: outer.id, decision: "approve", form: { ...outer.form, params } }] };
}

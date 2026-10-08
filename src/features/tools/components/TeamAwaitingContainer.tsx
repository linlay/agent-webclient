import React, { useState } from "react";
import type { AgentEvent, AIAwaitSubmitPayloadData, AIAwaitFormSubmitParamData } from "@/shared/contracts/agentEvents";
import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";
import { reduceActiveAwaiting } from "@/features/tools/lib/awaitingRuntime";
import { Buildin } from "./buildin";
import { AwaitingHtmlContainer } from "./AwaitingHtmlContainer";

// The outer waiting item owns routing and submits the entire frozen Team batch once.
export function TeamAwaitingContainer({ data, onSubmit, onResolved }: {
 data: FormActiveAwaiting; onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>; onResolved?: () => void;
}) {
 const [index, setIndex] = useState(0);
 const [answers, setAnswers] = useState<Record<string, AIAwaitFormSubmitParamData>>({});
 const outer = data.forms[index];
 const definition = outer?.form;
 const child = definition ? reduceActiveAwaiting(null, { ...definition, type: "awaiting.ask", runId: data.runId,
  agentKey: data.agentKey, awaitingId: String(definition.awaitingId || outer.id), timestamp: data.createdAt,
  timeout: data.timeout } as AgentEvent, { agentKey: data.agentKey }) : null;
 const submit = async (payload: AIAwaitSubmitPayloadData) => {
  if (!payload.params.length) { await onSubmit?.({runId:data.runId, awaitingId:data.awaitingId, params:[]}); return; }
  const entry: AIAwaitFormSubmitParamData = {id:outer.id, decision:"approve", form:{...definition, params:payload.params}};
  const next = {...answers, [outer.id]:entry};
  if (data.forms.every(form => next[form.id])) {
   await onSubmit?.({runId:data.runId, awaitingId:data.awaitingId, params:data.forms.map(form=>next[form.id])});
  } else { setAnswers(next); setIndex(data.forms.findIndex(form=>!next[form.id])); }
 };
 return <div key={data.key}>
  <div>{outer?.title} ({index+1}/{data.forms.length})</div>
  {child?.mode === "question" && <Buildin.QuestionDialog key={child.key} data={child} onSubmit={submit} onResolved={onResolved}/>}
  {child?.mode === "approval" && <Buildin.ApprovalDialog key={child.key} data={child} onSubmit={submit} onResolved={onResolved}/>}
  {child?.mode === "plan" && <Buildin.PlanDialog key={child.key} data={child} onSubmit={submit} onResolved={onResolved}/>}
  {child?.mode === "form" && <AwaitingHtmlContainer key={child.key} data={{...child,chatId:data.chatId}} onSubmit={submit} onResolved={onResolved}/>}
  {!child && <button type="button" aria-label="Close" onClick={()=>onSubmit?.({runId:data.runId,awaitingId:data.awaitingId,params:[]})}>×</button>}
 </div>;
}

import React, {useState} from "react";
import type {TimelineNode} from "@/features/timeline/lib/timelineState";
import {useTimelineInteraction} from "./TimelineInteractionContext";
import {useI18n} from "@/shared/i18n";
export function waitRemainingSeconds(deadlineAt:number,now:number):number{return Math.max(0,Math.ceil((deadlineAt-now)/1000));}
export function WaitCard({node,now,active}:{node:TimelineNode;now:number;active:boolean}) {
 const {t}=useI18n();const interaction=useTimelineInteraction();const [pending,setPending]=useState(false);const [error,setError]=useState(false);
 const wait=node.toolWait;if(!wait)return null;
 const seconds=waitRemainingSeconds(wait.deadlineAt,now);
 return <span className="tw:inline-flex tw:items-center tw:gap-2 tw:flex-wrap">
  <span>{wait.description}</span>
  {active && <span role="timer">{seconds>0 ? `${t(wait.conditions.length ? "timeline.wait.maximum" : "timeline.wait.remaining")} ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}` : t("timeline.wait.pending")}</span>}
  {wait.conditions.length>0 && <span>{wait.conditions.filter(c=>c.satisfied).length}/{wait.conditions.length} · {t(wait.match === "all" ? "timeline.wait.all" : "timeline.wait.any")}</span>}
  {active && !interaction?.readOnly && interaction?.skipWait && node.runId && node.toolId && <button className="tw:underline tw:underline-offset-2 tw:cursor-pointer disabled:tw:opacity-50" type="button" disabled={pending} onClick={async event=>{event.stopPropagation();setPending(true);setError(false);try{const result=await interaction.skipWait!(node.runId!,node.toolId!) as {accepted?:boolean;data?:{accepted?:boolean}};if(result?.accepted===false||result?.data?.accepted===false)throw new Error("wait no longer available");}catch{setError(true);setPending(false);}}}>{t(pending ? "timeline.wait.resuming" : "timeline.wait.resume")}</button>}
  {error && <span role="alert">{t("timeline.wait.error")}</span>}
 </span>;
}

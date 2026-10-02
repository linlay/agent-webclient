import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {WaitCard,waitRemainingSeconds} from "./WaitCard";
import {TimelineInteractionProvider} from "./TimelineInteractionContext";
import type {TimelineNode} from "@/features/timeline/lib/timelineState";
it("uses an absolute deadline and never counts below zero",()=>{expect(waitRemainingSeconds(10000,9001)).toBe(1);expect(waitRemainingSeconds(10000,12000)).toBe(0);});
it("only offers skip and a ticking timer for a live wait",()=>{
 const node:TimelineNode={id:"w",kind:"tool",ts:100,runId:"r",toolId:"w",status:"running",toolWait:{startedAt:100,deadlineAt:60100,description:"deployment",match:"any",conditions:[]}};
 const render=(active:boolean)=>renderToStaticMarkup(<TimelineInteractionProvider value={{skipWait:async()=>({accepted:true})}}><WaitCard node={node} now={100} active={active}/></TimelineInteractionProvider>);
 expect(render(true)).toContain('role="timer"');expect(render(true)).toContain('<button');expect(render(false)).not.toContain('role="timer"');expect(render(false)).not.toContain('<button');
});

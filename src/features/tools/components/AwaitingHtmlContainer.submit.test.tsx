/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AwaitingHtmlContainer } from "./AwaitingHtmlContainer";
import type { FormActiveAwaiting } from "../lib/toolsState";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let mockExpire: (() => void) | undefined;
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (key: string) => key }) }));
jest.mock("@/shared/ui/useAppMessage", () => ({ useAppMessage: () => ({ warning: jest.fn() }) }));
jest.mock("@/shared/utils/useKeyboard", () => ({ useKeyboard: () => {} }));
jest.mock("@/app/state/provider", () => ({ useOptionalAppContext: () => null }));
jest.mock("@/features/tools/hooks/useAwaitingFrameDocument", () => ({ useAwaitingFrameDocument: () => ({ html: "<p>Review</p>", loading: false, error: "" }) }));
jest.mock("@/features/tools/hooks/useAwaitingTimeoutCountdown", () => ({ useAwaitingTimeoutCountdown: ({ onExpire }: any) => { mockExpire = onExpire; return {label:""}; } }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("antd", () => {
  const R = require("react");
  const Box = ({children}:any) => R.createElement("div",null,children);
  const Radio = R.forwardRef(({children,value,onClick,disabled}:any,_ref:any) => R.createElement("button",{"data-decision":value,onClick,disabled},children));
  Radio.Group = Box;
  return {Radio,Flex:Box,Button:Box,Input:({value,onChange,disabled}:any)=>R.createElement("input",{value,onChange,disabled})};
});
const data = {key:"run:wait", mode:"form", runId:"run", awaitingId:"wait", viewportKey:"embedded-review", timeout:60,
 forms:[{id:"call",title:"Review operation",form:{content:"original"}}]} as FormActiveAwaiting;

async function mount() {
 const host=document.createElement("div");document.body.append(host);
 const root=createRoot(host), submit=jest.fn().mockResolvedValue(undefined);
 await act(async()=>root.render(<AwaitingHtmlContainer data={data} onSubmit={submit}/>));
 const frame=host.querySelector("iframe")!;
 const reply=async(id="call")=>act(async()=>{window.dispatchEvent(new MessageEvent("message",{source:frame.contentWindow,data:{type:"frontend_awaiting_submit",params:[{id,decision:"approve",form:{content:"original"}}]}}));});
 return {host,frame,submit,reply,click:async(decision:string)=>act(async()=>(host.querySelector(`[data-decision="${decision}"]`) as HTMLButtonElement).click()),cleanup:()=>{act(()=>root.unmount());host.remove();}};
}

test("HTML form accepts one requested response, ignores unsolicited and duplicate submits",async()=>{
 const view=await mount();
 try {
  expect(view.frame.getAttribute("sandbox")).toBe("allow-scripts");
  await view.reply();expect(view.submit).not.toHaveBeenCalled();
  await view.click("submit");await view.reply();await view.reply();
  expect(view.submit).toHaveBeenCalledTimes(1);
  expect(view.submit.mock.calls[0][0]).toMatchObject({runId:"run",awaitingId:"wait",params:[{id:"call",decision:"approve"}]});
 }finally{view.cleanup();}
});

test("unknown form IDs cannot submit and rejection does not require a frame response",async()=>{
 const view=await mount(),warn=jest.spyOn(console,"warn").mockImplementation(()=>{});
 try {
  await view.click("submit");await view.reply("another-call");expect(view.submit).not.toHaveBeenCalled();
  // The valid reply is still accepted for this pending collect.
  await view.reply();expect(view.submit).toHaveBeenCalledTimes(1);
  await view.click("reject");expect(view.submit).toHaveBeenCalledTimes(2);
  expect(view.submit.mock.calls[1][0].params[0].decision).toBe("reject");
 }finally{warn.mockRestore();view.cleanup();}
});

test("expiry neither collects nor submits and disables approval",async()=>{
 const view=await mount();
 try {
  const post=jest.spyOn(view.frame.contentWindow!,"postMessage");post.mockClear();
  await act(async()=>mockExpire?.());
  await view.reply();
  expect(post).not.toHaveBeenCalled();expect(view.submit).not.toHaveBeenCalled();
  expect((view.host.querySelector('[data-decision="submit"]') as HTMLButtonElement).disabled).toBe(true);
 }finally{view.cleanup();}
});

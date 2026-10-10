/** @jest-environment jsdom */
import React, { act } from "react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { createRoot } from "react-dom/client";
import { AwaitingHtmlContainer } from "./AwaitingHtmlContainer";
import type { FormActiveAwaiting } from "../lib/toolsState";
import { reduceActiveAwaiting } from "../lib/awaitingRuntime";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let mockExpire: (() => void) | undefined;
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (key: string) => key }) }));
jest.mock("@/shared/ui/useAppMessage", () => ({ useAppMessage: () => ({ warning: jest.fn() }) }));
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
const data = {key:"run:wait", mode:"form", runId:"run", awaitingId:"wait", viewKey:"embedded-review", timeout:60,
 forms:[{id:"call",title:"Review operation",form:{content:"original"}}]} as FormActiveAwaiting;

async function mount() {
 const host=document.createElement("div");document.body.append(host);
 const root=createRoot(host), submit=jest.fn().mockResolvedValue(undefined), patch=jest.fn();
 await act(async()=>root.render(<AwaitingHtmlContainer data={data} onSubmit={submit} onPatch={patch}/>));
 const frame=host.querySelector("iframe")!;
 const reply=async(decision="approve",data:unknown={content:"edited"})=>act(async()=>{window.dispatchEvent(new MessageEvent("message",{source:frame.contentWindow,data:{type:"frontend_awaiting_submit",param:{decision,data}}}));});
 return {host,frame,submit,patch,reply,render: async (next: FormActiveAwaiting) => act(async () => root.render(<AwaitingHtmlContainer data={next} onSubmit={submit} onPatch={patch}/>)),click:async(decision:string)=>act(async()=>(host.querySelector(`[data-decision="${decision}"]`) as HTMLButtonElement).click()),cleanup:()=>{act(()=>root.unmount());host.remove();}};
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

test("malformed replies cannot submit and rejection collects the edited data",async()=>{
 const view=await mount(),warn=jest.spyOn(console,"warn").mockImplementation(()=>{});
 try {
  await view.click("submit");await view.reply("approve","not-an-object");expect(view.submit).not.toHaveBeenCalled();
  // The valid reply is still accepted for this pending collect.
  await view.reply();expect(view.submit).toHaveBeenCalledTimes(1);
  const post=jest.spyOn(view.frame.contentWindow!,"postMessage");post.mockClear();
  await view.click("reject");
  expect(post).toHaveBeenCalledWith(expect.objectContaining({type:"awaiting_collect",data:expect.objectContaining({decision:"reject"})}),"*");
  expect(view.submit).toHaveBeenCalledTimes(1);
  await view.reply("reject");expect(view.submit).toHaveBeenCalledTimes(2);
  expect(view.submit.mock.calls[1][0].params[0]).toMatchObject({decision:"reject",form:{content:"edited"}});
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

async function pressDigit(key: string, options: KeyboardEventInit = {}, target: EventTarget = window) {
 const event = new KeyboardEvent("keydown", {key, bubbles:true, cancelable:true, ...options});
 await act(async()=>{target.dispatchEvent(event);});
 return event;
}

test("digit 1 collects the form once and digit 2 uses the rejection flow", async()=>{
 const view=await mount();
 try {
  const post=jest.spyOn(view.frame.contentWindow!,"postMessage");post.mockClear();
  expect((await pressDigit("1")).defaultPrevented).toBe(true);
  expect(post).toHaveBeenCalledWith(expect.objectContaining({type:"awaiting_collect"}),"*");
  await pressDigit("1");await pressDigit("2");
  expect(post).toHaveBeenCalledTimes(1);expect(view.submit).not.toHaveBeenCalled();
  await view.reply();expect(view.submit).toHaveBeenCalledTimes(1);
  expect((await pressDigit("2")).defaultPrevented).toBe(true);
  await view.reply("reject");
  expect(view.submit.mock.calls[1][0].params[0].decision).toBe("reject");
 }finally{view.cleanup();}
});

test("digits ignore editing, modifiers, composition, repeats and expired forms",async()=>{
 const view=await mount();
 try {
  const post=jest.spyOn(view.frame.contentWindow!,"postMessage");post.mockClear();
  const input=view.host.querySelector("input")!;
  for (const key of ["1","2"]) {
   await pressDigit(key,{},input);
   for (const option of ["metaKey","ctrlKey","altKey","shiftKey","repeat","isComposing"]) {
    await pressDigit(key,{[option]:true});
   }
  }
  await pressDigit("3");
  await act(async()=>mockExpire?.());
  await pressDigit("1");await pressDigit("2");
  expect(post).not.toHaveBeenCalled();expect(view.submit).not.toHaveBeenCalled();
 }finally{view.cleanup();}
});


test("focus release returns keyboard focus to the host only for the focused current frame", async () => {
 const view = await mount();
 const release = async (overrides = {}, source = view.frame.contentWindow) => act(async () => {
  window.dispatchEvent(new MessageEvent("message", {source, data: {type:"awaiting_focus_release", runId:"run", awaitingId:"wait", ...overrides}}));
 });
 try {
  const footer = view.host.querySelector(".awaiting-panel-footer") as HTMLElement;
  // Focus elsewhere in the host is never stolen.
  await release(); expect(document.activeElement).not.toBe(footer);
  view.frame.tabIndex = 0; view.frame.focus();
  await release({runId:"other"}); await release({awaitingId:"other"}); await release({}, window);
  expect(document.activeElement).toBe(view.frame);
  await release(); expect(document.activeElement).toBe(footer);
  expect(view.submit).not.toHaveBeenCalled();
  const post=jest.spyOn(view.frame.contentWindow!,"postMessage");post.mockClear();
  expect((await pressDigit("1", {}, footer)).defaultPrevented).toBe(true);
  expect(post).toHaveBeenCalledWith(expect.objectContaining({type:"awaiting_collect"}),"*");
 } finally { view.cleanup(); }
});


test("frame resize validates source and identity, grows and shrinks without submitting", async () => {
 const view = await mount();
 const resize = async (height: unknown, overrides = {}, source = view.frame.contentWindow) => act(async () => {
  window.dispatchEvent(new MessageEvent("message", {source, data: {type:"awaiting_resize", runId:"run", awaitingId:"wait", formId:"call", height, ...overrides}}));
 });
 try {
  expect(view.frame.style.height).toBe("420px");
  await resize(220); expect(view.frame.style.height).toBe("220px");
  await resize(520); expect(view.frame.style.height).toBe("520px");
  await resize(180); expect(view.frame.style.height).toBe("180px");
  for (const height of [NaN, Infinity, -1, 0, "300"]) await resize(height);
  await resize(300, {runId:"other"});
  await resize(300, {awaitingId:"other"});
  await resize(300, {formId:"other"});
  await resize(300, {}, window);
  expect(view.frame.style.height).toBe("180px");
  expect(view.submit).not.toHaveBeenCalled();
  await view.click("submit"); await resize(250); await view.reply();
  expect(view.submit).toHaveBeenCalledTimes(1);
 } finally { view.cleanup(); }
});


test("switching form identity resets sizing and ignores the previous form height", async () => {
 const view = await mount();
 const resize = async (formId: string, height: number) => act(async () => {
  const frame = view.host.querySelector("iframe")!;
  window.dispatchEvent(new MessageEvent("message", {source:frame.contentWindow, data:{type:"awaiting_resize",runId:"run",awaitingId:"wait",formId,height}}));
 });
 try {
  await resize("call", 240);
  expect(view.frame.style.height).toBe("240px");
  await view.render({...data, forms:[{id:"next",form:{}}]});
  expect(view.host.querySelector("iframe")!.style.height).toBe("420px");
  await resize("call", 600);
  expect(view.host.querySelector("iframe")!.style.height).toBe("420px");
  await resize("next", 160);
  expect(view.host.querySelector("iframe")!.style.height).toBe("160px");
  expect(view.submit).not.toHaveBeenCalled();
 } finally { view.cleanup(); }
});


test("ask_user_form labels and validation feedback allow an immediate retry", async () => {
 const view = await mount();
 const invalid = async (runId = "run", source = view.frame.contentWindow) => act(async () => {
  window.dispatchEvent(new MessageEvent("message", {source, data:{type:"frontend_awaiting_invalid",runId,awaitingId:"wait"}}));
 });
 try {
  await view.render({...data, view:{source:"builtin",key:"ask_user_form",renderer:"html"}, viewKey:"ask_user_form"});
  expect(view.host.textContent).toContain("awaiting.form.submit");
  expect(view.host.textContent).toContain("awaiting.form.decline");
  await invalid(); expect(view.host.textContent).not.toContain("awaiting.form.invalid");
  await view.click("submit");
  await invalid("other"); await invalid("run", window);
  expect((view.host.querySelector('[data-decision="submit"]') as HTMLButtonElement).disabled).toBe(true);
  await invalid();
  expect(view.host.textContent).toContain("awaiting.form.invalid");
  expect((view.host.querySelector('[data-decision="submit"]') as HTMLButtonElement).disabled).toBe(false);
  await view.reply(); expect(view.submit).not.toHaveBeenCalled();
  await view.click("submit"); await view.reply("approve", {name:"Alice"});
  expect(view.submit).toHaveBeenCalledTimes(1);
 } finally { view.cleanup(); }
});


test("ask_user_form keeps template data on a failed submit and retries current values", async () => {
 const view = await mount();
 try {
  await view.render({...data,view:{source:"builtin",key:"ask_user_form",renderer:"html"},viewKey:"ask_user_form",forms:[{id:"call",form:{html:'<input name="name">',values:{name:"old"}}}]});
  view.submit.mockResolvedValueOnce("offline");
  await view.click("submit"); await view.reply("approve",{name:"first"});
  expect(view.patch).not.toHaveBeenCalled();
  expect(view.host.textContent).toContain("awaiting.submit.failedWithDetail");
  await view.click("submit"); await view.reply("approve",{name:"second"});
  expect(view.submit.mock.calls[1][0].params[0].form).toEqual({name:"second"});
 } finally { view.cleanup(); }
});


// Exercise the real Platform bridge against the host's actual init payload.
// CI can supply the adjacent checkout via PLATFORM_SOURCE.
const sizingBridgePath = path.resolve(process.env.PLATFORM_SOURCE || "../agent-platform", "internal/resources/views/shared/resize.js");
(existsSync(sizingBridgePath) ? test : test.skip)("builtin sizing bridge uses the single-form awaiting identity without activeFormId", async () => {
 const view = await mount();
 try {
  const awaiting = reduceActiveAwaiting(null, {
   type: "awaiting.ask", runId: "run", awaitingId: "wait", mode: "form",
   view: {source: "builtin", key: "desktop_webapp_review", renderer: "html"},
   form: {title: "Start app", data: {action: "webapp.start", args: {id: "demo"}}},
  }) as FormActiveAwaiting;
  expect(awaiting.forms[0].id).toBe(awaiting.awaitingId);
  await view.render(awaiting);
  const frame = view.host.querySelector("iframe")!;
  const post = jest.spyOn(frame.contentWindow!, "postMessage");
  await act(async () => frame.dispatchEvent(new Event("load")));
  const init = post.mock.calls.find(([message]) => message.type === "awaiting_init")![0];
  expect(init.data.activeFormId).toBeUndefined();
  expect(init.data.form.id).toBeUndefined();
  const listeners: Record<string, (event: any) => void> = {};
  let height = 92, measure: () => void = () => {}, observe: () => void = () => {};
  const parent = {postMessage: (message: unknown) => window.dispatchEvent(new MessageEvent("message", {source: frame.contentWindow, data: message}))};
  runInNewContext(readFileSync(sizingBridgePath, "utf8"), {
   parent, document: {body: {getBoundingClientRect: () => ({bottom: height})}}, scrollY: 0,
   getComputedStyle: () => ({marginBottom: "0"}),
   addEventListener: (type: string, listener: (event: any) => void) => {listeners[type] = listener;},
   requestAnimationFrame: (callback: () => void) => {measure = callback; return 1;}, cancelAnimationFrame: () => {},
   ResizeObserver: class {constructor(callback: () => void) {observe = callback;} observe() {} disconnect() {}},
  });
  await act(async () => {listeners.message({source: parent, data: init}); measure();});
  expect(frame.style.height).toBe("92px");
  for (height of [330, 92]) {
   await act(async () => {observe(); measure();});
   expect(frame.style.height).toBe(`${height}px`);
  }
  expect(view.submit).not.toHaveBeenCalled();
 } finally {view.cleanup();}
});

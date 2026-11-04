/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDictationInput } from "./useDictationInput";
import { DictationSession } from "../lib/dictationSession";

type Options = ConstructorParameters<typeof DictationSession>[0];
type Result = Awaited<DictationSession["result"]>;
const sessions: Array<{ options: Options; prepare: jest.Mock; connect: jest.Mock; finish: jest.Mock; cancel: jest.Mock; settle: (result: Result) => void }> = [];
jest.mock("../lib/dictationSession", () => ({ DictationSession: jest.fn().mockImplementation((options: Options) => {
  let settle!: (result: Result) => void;
  const result = new Promise<Result>(resolve => { settle = resolve; });
  const session = { options, result, prepare: jest.fn(async () => undefined), connect: jest.fn(),
    finish: jest.fn(() => result), cancel: jest.fn(() => settle({ cancelled: true })), settle, fail: jest.fn() };
  sessions.push(session); return session;
}) }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/data", () => ({ ensureAccessToken: async () => "identity" }));
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: () => false }));
jest.mock("@/shared/config/featureFlags", () => ({ isDictationEnabled: () => true }));
jest.mock("@/shared/data/api/requests/dictation", () => ({ getDictationCapabilities: async () => ({ enabled:true,version:1,websocketPath:"/api/dictation/ws",maxRecordingSeconds:60,input:{codec:"pcm_s16le",sampleRate:16000,channels:1,frameMs:20} }) }));

let hook: ReturnType<typeof useDictationInput>, edit: (text:string)=>void, value: string;
function Harness({ scope }: { scope: string }) {
  const [draft, setDraft] = useState("prefix "); value = draft; edit = setDraft;
  hook = useDictationInput({ scopeKey:scope, inputValue:draft, setInputValue:setDraft, setSlashDismissed:jest.fn(), updateMentionSuggestions:jest.fn() });
  return null;
}
let root:Root, container:HTMLDivElement;
beforeEach(async () => {
  sessions.length=0; (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  Object.defineProperty(globalThis,"AudioContext",{ configurable:true,value:class {} });
  Object.defineProperty(navigator,"mediaDevices",{ configurable:true,value:{getUserMedia:jest.fn()} });
  container=document.createElement("div"); root=createRoot(container);
  await act(async () => root.render(<Harness scope="a"/>));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function start() { await act(async () => { hook.toggleDictation(); expect(sessions.at(-1)?.prepare).toHaveBeenCalledTimes(1); }); return sessions.at(-1)!; }

it("replaces this recording's text snapshot and returns the final draft directly", async () => {
  const session=await start();
  act(() => session.options.onText("hello")); expect(value).toBe("prefix hello");
  act(() => session.options.onText("hello world")); expect(value).toBe("prefix hello world");
  let finished!:Promise<string|undefined>|null;
  act(() => { finished=hook.finishDictation(); });
  await act(async () => { session.options.onText("final"); session.settle({text:"final"}); });
  expect(await finished).toBe("prefix final");
});

it.each(["edit","scope","voice","pagehide"])("%s cancels a pending send and rejects old text callbacks", async cause => {
  const session=await start();
  act(() => session.options.onText("partial"));
  const finished=hook.finishDictation();
  await act(async () => {
    if (cause==="edit") { hook.cancelDictation(); edit("my edit"); }
    if (cause==="scope") root.render(<Harness scope="b"/>);
    if (cause==="voice") window.dispatchEvent(new Event("agent:dictation-cancel"));
    if (cause==="pagehide") window.dispatchEvent(new Event("pagehide"));
  });
  expect(session.cancel).toHaveBeenCalledTimes(1);
  await act(async () => { session.options.onText("late"); session.settle({text:"late"}); });
  expect(await finished).toBeUndefined(); expect(value).toBe(cause==="edit"?"my edit":"prefix partial");
});

it("programmatic history edits invalidate the current recording", async () => {
  const session=await start(); act(() => edit("history"));
  expect(session.cancel).toHaveBeenCalledTimes(1);
  act(() => session.options.onText("late")); expect(value).toBe("history");
});

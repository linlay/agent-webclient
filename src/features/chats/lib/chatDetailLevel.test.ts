import { chatDetailLevel } from "./chatDetailLevel";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
let initialState: ReturnType<typeof createInitialState>;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
 Object.defineProperty(globalThis, "localStorage", {configurable:true,value:{getItem:(key:string) => key === "agent-webclient.eventDetailLevel.v1" ? "detailed" : null}});
 initialState = createInitialState();
});
afterAll(() => {
 if (storageDescriptor) Object.defineProperty(globalThis,"localStorage",storageDescriptor);
 else Reflect.deleteProperty(globalThis,"localStorage");
});

it("uses the selected Agent default and never infers detail from mode", () => {
  const state = { ...initialState, pendingNewChatAgentKey: "code", agents: [{key:"code", name:"Code", mode:"CODER"}] };
  expect(chatDetailLevel(state)).toBe("simple");
  expect(chatDetailLevel({...state, currentAgent:{...state.agents[0], interactionConfig:{defaultDetail:"detailed"}}})).toBe("detailed");
});
it("uses loaded Chat metadata before Agent hydration, rendering what was delivered", () => {
  const state = {...initialState, chatId:"old", chats:[{chatId:"old", agentKey:"deleted", display:{defaultDetail:"simple" as const, effectiveDetail:"simple" as const}}], agents:[]};
  expect(chatDetailLevel(state)).toBe("simple");
  const detailed = {...state, chats:[{...state.chats[0], display:{defaultDetail:"detailed" as const, effectiveDetail:"detailed" as const}}]};
  expect(chatDetailLevel(detailed)).toBe("detailed");
  const refreshed = appReducer(detailed, {type:"SET_CHATS", chats:[{chatId:"old", agentKey:"deleted"}]});
  expect(chatDetailLevel(refreshed)).toBe("detailed");
});
it("keeps an existing Chat's owner separate from New Chat selection", () => {
 const state = {...initialState, chatId:"old", chats:[{chatId:"old", agentKey:"old-owner"}], pendingNewChatAgentKey:"other", agents:[{key:"old-owner",name:"Old",interactionConfig:{defaultDetail:"simple"}},{key:"other",name:"Other",interactionConfig:{defaultDetail:"detailed"}}]};
 expect(chatDetailLevel(state)).toBe("simple");
});

it("uses an explicit delivery override, in Desktop as well", () => {
 expect(chatDetailLevel({...initialState,chatId:"old",chats:[{chatId:"old",display:{defaultDetail:"simple",effectiveDetail:"detailed"}}]})).toBe("detailed");
});


it("keeps summary from both Agent defaults and delivered Chat metadata", () => {
 expect(chatDetailLevel({...initialState,pendingNewChatAgentKey:"agent",currentAgent:{key:"agent",name:"Agent",interactionConfig:{defaultDetail:"summary"}}})).toBe("summary");
 expect(chatDetailLevel({...initialState,chatId:"old",chats:[{chatId:"old",display:{defaultDetail:"summary",effectiveDetail:"summary"}}]})).toBe("summary");
});

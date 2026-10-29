import { chatDetailLevel } from "./chatDetailLevel";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
let initialState: ReturnType<typeof createInitialState>;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
 Object.defineProperty(globalThis, "localStorage", {configurable:true,value:{getItem:(key:string) => key === "agent-webclient.eventDetailLevel.v1" ? "full" : null}});
 initialState = createInitialState();
});
afterAll(() => {
 if (storageDescriptor) Object.defineProperty(globalThis,"localStorage",storageDescriptor);
 else Reflect.deleteProperty(globalThis,"localStorage");
});

it("uses the selected Agent default and never infers detail from mode", () => {
  const state = { ...initialState, pendingNewChatAgentKey: "code", agents: [{key:"code", name:"Code", mode:"CODER"}] };
  expect(chatDetailLevel(state)).toBe("summary");
  expect(chatDetailLevel({...state, agents:[{...state.agents[0], interactionConfig:{defaultDetail:"full"}}]})).toBe("full");
});
it("uses loaded Chat metadata before Agent hydration, rendering what was delivered", () => {
  const state = {...initialState, chatId:"old", chats:[{chatId:"old", agentKey:"deleted", display:{defaultDetail:"summary" as const, effectiveDetail:"summary" as const}}], agents:[]};
  expect(chatDetailLevel(state)).toBe("summary");
  const detailed = {...state, chats:[{...state.chats[0], display:{defaultDetail:"full" as const, effectiveDetail:"full" as const}}]};
  expect(chatDetailLevel(detailed)).toBe("full");
  const refreshed = appReducer(detailed, {type:"SET_CHATS", chats:[{chatId:"old", agentKey:"deleted"}]});
  expect(chatDetailLevel(refreshed)).toBe("full");
});
it("keeps an existing Chat's owner separate from New Chat selection", () => {
 const state = {...initialState, chatId:"old", chats:[{chatId:"old", agentKey:"old-owner"}], pendingNewChatAgentKey:"other", agents:[{key:"old-owner",name:"Old",interactionConfig:{defaultDetail:"summary"}},{key:"other",name:"Other",interactionConfig:{defaultDetail:"full"}}]};
 expect(chatDetailLevel(state)).toBe("summary");
});

it("uses an explicit delivery override, in Desktop as well", () => {
 expect(chatDetailLevel({...initialState,chatId:"old",chats:[{chatId:"old",display:{defaultDetail:"summary",effectiveDetail:"full"}}]})).toBe("full");
});

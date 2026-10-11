export interface SelectedKBase { id: string; name: string }
export interface KBasesState { selectedKbasesByScope: Record<string, SelectedKBase[]> }
export type KBasesAction =
 | { type: "SET_SELECTED_KBASES"; scope: string; libraries: SelectedKBase[] }
 | { type: "PROMOTE_KBASE_SELECTION"; scope: string; chatId: string };
export const kbaseSelectionScope = (chatId: string, agentKey: string) => chatId ? `chat:${chatId}` : `new:${agentKey}`;
export const createInitialKBasesState = (): KBasesState => ({ selectedKbasesByScope: {} });
export function reduceKBasesState<S extends KBasesState>(state: S, input: {type: string}): S | null {
 const action = input as KBasesAction;
 switch (action.type) {
  case "SET_SELECTED_KBASES": {
   const ids = new Set<string>();
   const libraries = action.libraries.flatMap(item => {
    if (!item.id || ids.has(item.id)) return [];
    ids.add(item.id);
    return [{...item}];
   });
   return {...state, selectedKbasesByScope: {...state.selectedKbasesByScope, [action.scope]: libraries}};
  }
  case "PROMOTE_KBASE_SELECTION": {
   if (!action.chatId || !action.scope.startsWith("new:")) return state;
   const selections = {...state.selectedKbasesByScope};
   selections[`chat:${action.chatId}`] = (selections[action.scope] || []).map(item => ({...item}));
   delete selections[action.scope];
   return {...state, selectedKbasesByScope: selections};
  }
  default: return null;
 }
}

export function initializeChatKbases(state: KBasesState, chatId: string, events: import("@/shared/contracts/agentEvents").AgentEvent[]): KBasesState {
 const scope = kbaseSelectionScope(chatId, "");
 if (!chatId || Object.prototype.hasOwnProperty.call(state.selectedKbasesByScope, scope)) return state;
 const event = [...events].reverse().find(item => item.type === "request.query" && !item.taskId && !item.lane && (!item.chatId || item.chatId === chatId));
 const query = event?.query as {mustUseKbases?: unknown} | undefined;
 const raw = event?.mustUseKbases ?? query?.mustUseKbases;
 const ids = Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string").map(id => id.trim()).filter(Boolean))] : [];
 return {...state, selectedKbasesByScope: {...state.selectedKbasesByScope, [scope]: ids.map(id => ({id, name: id}))}};
}

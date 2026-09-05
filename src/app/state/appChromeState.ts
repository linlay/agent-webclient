import type { ThemeMode } from "@/shared/styles/theme";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { UiTimerHandle } from "@/shared/contracts/ui";

export type CommandStatusOverlayCommandType = "remember" | "learn" | "compact" | null;
export type CommandStatusOverlayPhase = "pending" | "success" | "error";

export interface CommandStatusOverlayState {
  visible: boolean;
  commandType: CommandStatusOverlayCommandType;
  phase: CommandStatusOverlayPhase;
  text: string;
  timer: UiTimerHandle | null;
}

export interface AppChromeState {
  leftDrawerOpen: boolean;
  terminalDockOpen: boolean;
  themeMode: ThemeMode;
  accessToken: string;
  eventPopoverIndex: number;
  eventPopoverEventRef: AgentEvent | null;
  eventPopoverAnchor: { x: number; y: number } | null;
  commandStatusOverlay: CommandStatusOverlayState;
}

export type AppChromeAction =
  | { type: "SET_LEFT_DRAWER_OPEN"; open: boolean }
  | { type: "SET_TERMINAL_DOCK_OPEN"; open: boolean }
  | { type: "SET_THEME_MODE"; themeMode: ThemeMode }
  | { type: "SET_ACCESS_TOKEN"; token: string }
  | { type: "SET_EVENT_POPOVER"; index: number; event: AgentEvent | null; anchor?: { x: number; y: number } | null }
  | { type: "SHOW_COMMAND_STATUS_OVERLAY"; commandType: NonNullable<CommandStatusOverlayCommandType>; phase: CommandStatusOverlayPhase; text: string }
  | { type: "SET_COMMAND_STATUS_OVERLAY_TIMER"; timer: UiTimerHandle | null }
  | { type: "HIDE_COMMAND_STATUS_OVERLAY" };

export function createInitialAppChromeState(input: {
  themeMode: ThemeMode;
  accessToken: string;
  terminalDockOpen: boolean;
}): AppChromeState {
  return {
    leftDrawerOpen: true,
    terminalDockOpen: input.terminalDockOpen,
    themeMode: input.themeMode,
    accessToken: input.accessToken,
    eventPopoverIndex: -1,
    eventPopoverEventRef: null,
    eventPopoverAnchor: null,
    commandStatusOverlay: { visible: false, commandType: null, phase: "success", text: "", timer: null },
  };
}

export function reduceAppChromeState(state: AppChromeState, action: AppChromeAction): AppChromeState {
  switch (action.type) {
    case "SET_LEFT_DRAWER_OPEN": return { ...state, leftDrawerOpen: action.open };
    case "SET_TERMINAL_DOCK_OPEN": return { ...state, terminalDockOpen: action.open };
    case "SET_THEME_MODE": return { ...state, themeMode: action.themeMode };
    case "SET_ACCESS_TOKEN": return { ...state, accessToken: action.token };
    case "SET_EVENT_POPOVER": return { ...state, eventPopoverIndex: action.index, eventPopoverEventRef: action.event, eventPopoverAnchor: action.anchor ?? null };
    case "SHOW_COMMAND_STATUS_OVERLAY": return { ...state, commandStatusOverlay: { ...state.commandStatusOverlay, visible: true, commandType: action.commandType, phase: action.phase, text: action.text } };
    case "SET_COMMAND_STATUS_OVERLAY_TIMER": return { ...state, commandStatusOverlay: { ...state.commandStatusOverlay, timer: action.timer } };
    case "HIDE_COMMAND_STATUS_OVERLAY": return { ...state, commandStatusOverlay: { ...state.commandStatusOverlay, visible: false } };
  }
}

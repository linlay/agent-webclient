export type CommandOverlayType =
  | "history"
  | "switch"
  | "detail"
  | "automation"
  | "agents";

export type CommandOverlayScope = "all" | "agent" | "team";
export type CommandOverlayFocusArea = "search" | "list";

export interface CommandOverlayState {
  open: boolean;
  type: CommandOverlayType | null;
  searchText: string;
  historySearch: string;
  activeIndex: number;
  scope: CommandOverlayScope;
  focusArea: CommandOverlayFocusArea;
}

export type CommandOverlayOpenOptions = Partial<
  Omit<CommandOverlayState, "open" | "type">
> & {
  type: CommandOverlayType;
};

export function createCommandOverlayState(
  options?: CommandOverlayOpenOptions,
): CommandOverlayState {
  return {
    open: Boolean(options),
    type: options?.type ?? null,
    searchText: options?.searchText ?? "",
    historySearch: options?.historySearch ?? "",
    activeIndex: options?.activeIndex ?? 0,
    scope: options?.scope ?? "all",
    focusArea: options?.focusArea ?? "search",
  };
}

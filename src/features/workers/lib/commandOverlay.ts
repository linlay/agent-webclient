export type CommandOverlayType =
  | "history"
  | "automation"
  | "agents";

export interface CommandOverlayState {
  open: boolean;
  type: CommandOverlayType | null;
  historySearch: string;
  activeIndex: number;
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
    historySearch: options?.historySearch ?? "",
    activeIndex: options?.activeIndex ?? 0,
  };
}

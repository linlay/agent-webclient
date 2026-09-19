import type { GlobalRow } from "./globalSearchRows";

// Local to the open command palette, so browser/application shortcuts remain untouched elsewhere.
export const GLOBAL_SEARCH_ACTION_SHORTCUTS: Readonly<Record<string, { key: string; code: string }>> = {
  newConversation: { key: "N", code: "KeyN" },
  history: { key: "H", code: "KeyH" },
  settings: { key: ",", code: "Comma" },
  debug: { key: "D", code: "KeyD" },
};

export function isMacShortcutPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function findGlobalSearchShortcut(
  rows: readonly GlobalRow[],
  event: { code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  isMac: boolean,
): GlobalRow | undefined {
  if (event.altKey || event.shiftKey || (isMac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)) return;
  return rows.find(row => row.kind === "action" && GLOBAL_SEARCH_ACTION_SHORTCUTS[row.action]?.code === event.code);
}

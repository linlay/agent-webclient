import { formatTerminalShellName } from "@/features/terminal/lib/terminalWorkspace";
import { toText } from "@/shared/utils/eventUtils";

const MAX_TAB_TITLE_LENGTH = 32;

const OSC_PATTERN = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/gu;
const CSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/gu;
const ESC_PATTERN = /\x1b[@-Z\\-_]/gu;

export function stripTerminalAnsi(text: string): string {
  return text
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(ESC_PATTERN, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "");
}

export function formatRestoreTime(epochMs: number): string {
  const date = new Date(Number.isFinite(epochMs) ? epochMs : Date.now());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatTerminalTabTitle(
  meta: { readonly title?: string; readonly shell?: string },
  fallback: string,
): string {
  const cleanedTitle = stripTerminalAnsi(toText(meta.title))
    .replace(/\s+/gu, " ")
    .trim();
  if (cleanedTitle) {
    if (cleanedTitle.length <= MAX_TAB_TITLE_LENGTH) {
      return cleanedTitle;
    }
    return `${cleanedTitle.slice(0, MAX_TAB_TITLE_LENGTH).trimEnd()}…`;
  }
  const shellName = formatTerminalShellName(meta.shell);
  if (shellName) {
    return shellName;
  }
  return fallback;
}

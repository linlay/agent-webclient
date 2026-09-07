import type { Terminal } from "@xterm/xterm";

export type ToolOutputWritePlan =
  | { mode: "noop"; text: "" }
  | { mode: "append"; text: string }
  | { mode: "reset"; text: string };

export function resolveToolOutputWritePlan(
  appliedText: string,
  desiredText: string,
): ToolOutputWritePlan {
  if (appliedText === desiredText) {
    return { mode: "noop", text: "" };
  }
  if (desiredText.startsWith(appliedText)) {
    return {
      mode: "append",
      text: desiredText.slice(appliedText.length),
    };
  }
  return { mode: "reset", text: desiredText };
}

export function resolveToolOutputTerminalRows(
  terminal: Pick<Terminal, "buffer">,
): number {
  const buffer = terminal.buffer.active;
  let lastUsedLine = buffer.baseY + buffer.cursorY;

  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const line = buffer.getLine(index);
    if (line?.translateToString(true)) {
      lastUsedLine = Math.max(lastUsedLine, index);
      break;
    }
  }

  return Math.max(1, lastUsedLine + 1);
}

export function readToolOutputTerminalText(
  terminal: Pick<Terminal, "buffer">,
): string {
  const buffer = terminal.buffer.active;
  let lastUsedLine = -1;
  const lines: string[] = [];

  for (let index = 0; index < buffer.length; index += 1) {
    const text = buffer.getLine(index)?.translateToString(true) || "";
    lines.push(text);
    if (text) lastUsedLine = index;
  }

  return lastUsedLine < 0 ? "" : lines.slice(0, lastUsedLine + 1).join("\n");
}

import { Terminal } from "@xterm/xterm";
import {
  readToolOutputTerminalText,
  resolveToolOutputTerminalRows,
  resolveToolOutputWritePlan,
} from "@/features/terminal/lib/toolOutputTerminal";

function writeTerminal(terminal: Terminal, text: string): Promise<void> {
  return new Promise((resolve) => terminal.write(text, resolve));
}

describe("tool output terminal", () => {
  it("appends strict text suffixes and resets rewritten retained output", () => {
    expect(resolveToolOutputWritePlan("", "scan\n")).toEqual({
      mode: "append",
      text: "scan\n",
    });
    expect(resolveToolOutputWritePlan("scan\n", "scan\nwaiting\n")).toEqual({
      mode: "append",
      text: "waiting\n",
    });
    expect(
      resolveToolOutputWritePlan(
        "head\nold tail\n",
        "head\n… [tool output truncated] …\nnew tail\n",
      ),
    ).toEqual({
      mode: "reset",
      text: "head\n… [tool output truncated] …\nnew tail\n",
    });
    expect(resolveToolOutputWritePlan("same", "same")).toEqual({
      mode: "noop",
      text: "",
    });
  });

  it("keeps QR indentation and every received line", async () => {
    const qrOutput = [
      "Scan this QR code to log in:",
      "    ██████████████  ██  ████  ██████████████",
      "    ██          ██  ██████    ██          ██",
      "    ██  ██████  ██    ██  ██  ██  ██████  ██",
      "    ██  ██████  ██  ████      ██  ██████  ██",
      "    ██  ██████  ██  ██  ████  ██  ██████  ██",
      "    ██          ██    ████    ██          ██",
      "    ██████████████  ██  ██  ██  ██████████████",
      "                    ████████",
      "    ██  ██  ██  ██      ██████  ████  ██  ██",
      "      ██  ██████  ██  ██      ████  ██████",
      "    ████      ██████    ██  ██████████    ██",
      "    ██  ████      ██████  ████  ██  ██",
      "      ████  ██████  ████        ██  ████████",
      "                    ██  ██  ████      ██",
      "    ██████████████  ██████  ████  ██  ██  ██",
      "    ██          ██    ████████        ██",
      "    ██  ██████  ██  ████    ████████████████",
      "    ██  ██████  ██  ██  ████    ██      ██",
      "    ██  ██████  ██    ██████  ██████  ██  ██",
      "    ██          ██  ████      ██      ████",
      "    ██████████████  ██  ██  ██████  ██  ████",
      "Waiting for confirmation...",
    ].join("\n");
    const terminal = new Terminal({
      cols: 80,
      rows: 1,
      convertEol: true,
      scrollback: 100,
    });

    try {
      await writeTerminal(terminal, qrOutput);

      expect(readToolOutputTerminalText(terminal)).toBe(qrOutput);
      expect(resolveToolOutputTerminalRows(terminal)).toBe(23);
    } finally {
      terminal.dispose();
    }
  });

  it("applies carriage returns, backspaces, and ANSI styling as terminal control", async () => {
    const terminal = new Terminal({
      cols: 80,
      rows: 1,
      convertEol: true,
      scrollback: 100,
    });

    try {
      await writeTerminal(
        terminal,
        "progress=000%\rprogress=100%\ncount=10\b1\n\u001b[31merror\u001b[0m",
      );

      expect(readToolOutputTerminalText(terminal)).toBe(
        "progress=100%\ncount=11\nerror",
      );
      expect(resolveToolOutputTerminalRows(terminal)).toBe(3);
    } finally {
      terminal.dispose();
    }
  });

  it("keeps split carriage-return and ANSI sequences intact across chunks", async () => {
    const terminal = new Terminal({
      cols: 80,
      rows: 1,
      convertEol: true,
      scrollback: 100,
    });

    try {
      for (const chunk of [
        "event=start\nprogress=000%",
        "\rprogress=050%\nevent=log sequence=1\nprogress=050%\r\u001b[",
        "2Kprogress=100%\n",
      ]) {
        await writeTerminal(terminal, chunk);
      }

      expect(readToolOutputTerminalText(terminal)).toBe(
        "event=start\nprogress=050%\nevent=log sequence=1\nprogress=100%",
      );
      expect(resolveToolOutputTerminalRows(terminal)).toBe(5);
    } finally {
      terminal.dispose();
    }
  });
});

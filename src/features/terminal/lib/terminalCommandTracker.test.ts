/** @jest-environment jsdom */

import {
  formatRestoreTime,
  formatTerminalTabTitle,
  stripTerminalAnsi,
} from "./terminalCommandTracker";

describe("terminalCommandTracker", () => {
  it("strips ANSI CSI, OSC, and carriage returns while keeping readable lines", () => {
    const raw = "\x1b]133;C\x07\x1b[31mFAIL\x1b[0m suite\r\nline 2\x1b]2;title\x1b\\ ok";
    expect(stripTerminalAnsi(raw)).toBe("FAIL suite\nline 2 ok");
  });

  it("formats local HH:mm restore timestamp", () => {
    const d = new Date(2026, 10, 19, 9, 5, 0, 0);
    expect(formatRestoreTime(d.getTime())).toBe("09:05");
  });

  it("formats terminal tab titles preferring shell title then shell basename then fallback", () => {
    expect(formatTerminalTabTitle({ title: "  npm   test \x1b[0m", shell: "/bin/zsh" }, "Terminal")).toBe(
      "npm test",
    );
    const longTitle = "a".repeat(40);
    const formattedLong = formatTerminalTabTitle({ title: longTitle, shell: "/bin/zsh" }, "Terminal");
    expect(formattedLong.length).toBeLessThanOrEqual(33);
    expect(formattedLong.endsWith("…")).toBe(true);
    expect(formatTerminalTabTitle({ title: "", shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" }, "Terminal")).toBe(
      "pwsh",
    );
    expect(formatTerminalTabTitle({}, "Terminal")).toBe("Terminal");
  });
});

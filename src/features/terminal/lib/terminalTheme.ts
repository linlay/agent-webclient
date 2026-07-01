import type { ITheme } from "@xterm/xterm";

export function resolveTerminalTheme(themeMode: string): ITheme {
  const isDark = themeMode === "dark";
  if (isDark) {
    return {
      foreground: "#c9cdd4",
      background: "#181818",
      cursor: "#c9cdd4",
      cursorAccent: "#181818",
      selectionBackground: "rgba(79, 136, 255, 0.28)",
      selectionForeground: "#f2f3f5",
      black: "#1e1e2e",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#cba6f7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#45475a",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#cba6f7",
      brightCyan: "#94e2d5",
      brightWhite: "#cdd6f4",
    };
  }
  return {
    foreground: "#2c2c2c",
    background: "#fff",
    cursor: "#2c2c2c",
    cursorAccent: "#fafafa",
    selectionBackground: "rgba(38, 99, 235, 0.2)",
    selectionForeground: "#1d2129",
    black: "#2e3436",
    red: "#cc0000",
    green: "#4e9a06",
    yellow: "#c4a000",
    blue: "#3465a4",
    magenta: "#75507b",
    cyan: "#06989a",
    white: "#d3d7cf",
    brightBlack: "#555753",
    brightRed: "#ef2929",
    brightGreen: "#8ae234",
    brightYellow: "#fce94f",
    brightBlue: "#729fcf",
    brightMagenta: "#ad7fa8",
    brightCyan: "#34e2e2",
    brightWhite: "#eeeeec",
  };
}

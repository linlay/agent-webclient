jest.mock("@xterm/xterm/css/xterm.css", () => ({}), { virtual: true });
jest.mock("@xterm/xterm", () => ({ Terminal: jest.fn() }));
jest.mock("@xterm/addon-fit", () => ({ FitAddon: jest.fn() }));
jest.mock("@/features/transport/lib/wsClientSingleton", () => ({
  getWsClient: jest.fn(),
  initWsClient: jest.fn(),
  updateCurrentWsClientOptions: jest.fn(),
}));
jest.mock("@/shared/api/apiClient", () => ({
  ensureAccessToken: jest.fn(),
  getCurrentAccessToken: jest.fn(),
}));

import { resolveTerminalDockWorkspaceKey, resolveTerminalTheme } from "@/app/layout/TerminalDock";

describe("resolveTerminalDockWorkspaceKey", () => {
  it("uses an absolute worker row workspace when available", () => {
    expect(
      resolveTerminalDockWorkspaceKey({
        type: "agent",
        raw: null,
        row: { workspaceDir: "/Users/demo/Project/coder" },
      } as never),
    ).toBe("/Users/demo/Project/coder");
  });

  it("preserves @chat from raw agent metadata even when worker rows hide it", () => {
    expect(
      resolveTerminalDockWorkspaceKey({
        type: "agent",
        raw: { workspaceDir: " @chat " },
        row: { workspaceDir: undefined },
      } as never),
    ).toBe("@chat");
  });

  it("falls back to nested workspace.root metadata", () => {
    expect(
      resolveTerminalDockWorkspaceKey({
        type: "agent",
        raw: { workspace: { root: "@chat" } },
        row: { workspaceDir: undefined },
      } as never),
    ).toBe("@chat");
  });

  it("ignores non-agent workers", () => {
    expect(resolveTerminalDockWorkspaceKey(null)).toBe("");
    expect(
      resolveTerminalDockWorkspaceKey({
        type: "team",
        raw: { workspaceDir: "/tmp/team" },
        row: { workspaceDir: "/tmp/team" },
      } as never),
    ).toBe("");
  });
});

describe("resolveTerminalTheme", () => {
  it("returns dark theme for \"dark\" mode", () => {
    const theme = resolveTerminalTheme("dark");
    expect(theme.background).toBe("#181818");
    expect(theme.foreground).toBe("#c9cdd4");
    expect(theme.cursor).toBe("#c9cdd4");
    expect(theme.cursorAccent).toBe("#181818");
    expect(theme.black).toBe("#1e1e2e");
    expect(theme.white).toBe("#bac2de");
  });

  it("returns light theme for \"light\" mode", () => {
    const theme = resolveTerminalTheme("light");
    expect(theme.background).toBe("#fafafa");
    expect(theme.foreground).toBe("#2c2c2c");
    expect(theme.cursor).toBe("#2c2c2c");
    expect(theme.cursorAccent).toBe("#fafafa");
    expect(theme.black).toBe("#2e3436");
    expect(theme.white).toBe("#d3d7cf");
  });

  it("falls back to light theme for unknown values", () => {
    const theme = resolveTerminalTheme("system");
    expect(theme.background).toBe("#fafafa");
    expect(theme.foreground).toBe("#2c2c2c");
  });

  it("falls back to light theme for empty string", () => {
    const theme = resolveTerminalTheme("");
    expect(theme.background).toBe("#fafafa");
  });
});

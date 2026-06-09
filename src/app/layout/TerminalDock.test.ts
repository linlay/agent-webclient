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

import { resolveTerminalDockWorkspaceKey } from "@/app/layout/TerminalDock";

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

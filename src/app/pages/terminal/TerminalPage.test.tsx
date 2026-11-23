/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { formatTerminalShellName } from "@/features/terminal/lib/terminalWorkspace";
import { TerminalPage } from "./index";

const capturedPaneProps: Array<{
  agentKey: string;
  terminalKey: string;
  initialCwd?: string;
  initialProfile?: string;
  macOptionIsMeta?: boolean;
  onMetaChange?: (meta: { shell?: string; cwd?: string; title?: string }) => void;
}> = [];
const capturedWorkspaceProps: Array<Record<string, unknown>> = [];

let mockAgentKey = "coder";
let mockTerminalKey = "main";
let mockCwd = "";
let mockProfile = "";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ agentKey: mockAgentKey }),
  useSearchParams: () => {
    const params = new URLSearchParams();
    if (mockTerminalKey) {
      params.set("terminalKey", mockTerminalKey);
    }
    if (mockCwd) {
      params.set("cwd", mockCwd);
    }
    if (mockProfile) {
      params.set("profile", mockProfile);
    }
    return [params];
  },
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => ({ themeMode: "light" }),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("@/features/terminal/components/TerminalPane", () => ({
  TerminalPane: (props: {
    agentKey: string;
    terminalKey: string;
    initialCwd?: string;
    initialProfile?: string;
    macOptionIsMeta?: boolean;
    onMetaChange?: (meta: { shell?: string; cwd?: string; title?: string }) => void;
  }) => {
    capturedPaneProps.push(props);
    return React.createElement("div", {
      "data-testid": "single-terminal-pane",
      "data-agent-key": props.agentKey,
      "data-terminal-key": props.terminalKey,
    });
  },
}));

jest.mock("@/features/terminal/components/TerminalWorkspace", () => ({
  TerminalWorkspace: (props: Record<string, unknown>) => {
    capturedWorkspaceProps.push(props);
    return React.createElement("div", {
      "data-testid": "standalone-terminal-workspace",
    });
  },
}));

const globalConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("TerminalPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    globalConfig.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    delete globalConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    capturedPaneProps.length = 0;
    capturedWorkspaceProps.length = 0;
    mockAgentKey = "coder";
    mockTerminalKey = "term-2";
    mockCwd = "";
    mockProfile = "";
    localStorage.clear();
    document.title = "AGENT Webclient";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("formats shell executable paths to clean shell labels", () => {
    expect(formatTerminalShellName("/bin/zsh")).toBe("zsh");
    expect(formatTerminalShellName("/opt/homebrew/bin/bash")).toBe("bash");
    expect(formatTerminalShellName("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("pwsh");
    expect(formatTerminalShellName("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
    expect(formatTerminalShellName("")).toBe("");
  });

  it("renders a clean single-terminal layout in Desktop mode and syncs shell title", async () => {
    globalConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: "true" };

    await act(async () => {
      root.render(React.createElement(TerminalPage));
    });

    expect(container.querySelector(".terminal-dock-tabs")).toBeNull();
    expect(container.querySelector(".terminal-single-header")).toBeNull();
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector('[data-testid="standalone-terminal-workspace"]')).toBeNull();
    expect(container.querySelector('[data-testid="single-terminal-pane"]')).not.toBeNull();
    expect(capturedPaneProps).toHaveLength(1);
    expect(typeof capturedPaneProps[0].onMetaChange).toBe("function");

    await act(async () => {
      capturedPaneProps[0].onMetaChange?.({ shell: "/bin/zsh", cwd: "/repo" });
    });

    expect(container.querySelector(".terminal-single-header")).toBeNull();
    expect(container.querySelector("header")).toBeNull();
    expect(document.title).toBe("zsh");

    await act(async () => {
      capturedPaneProps[0].onMetaChange?.({ shell: "/bin/zsh", cwd: "/repo", title: "dev-server" });
    });
    expect(document.title).toBe("dev-server");
  });

  it("forwards cwd search query param as initialCwd to TerminalPane in desktop mode", async () => {
    globalConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: "true" };
    mockAgentKey = "coder";
    mockTerminalKey = "tab-2";
    mockCwd = "/repo/sub";

    await act(async () => {
      root.render(React.createElement(TerminalPage));
    });

    expect(capturedPaneProps).toHaveLength(1);
    expect(capturedPaneProps[0].initialCwd).toBe("/repo/sub");
    expect(container.querySelector(".terminal-single-header")).toBeNull();
    expect(container.querySelector("header")).toBeNull();
  });

  it("renders TerminalWorkspace in Standalone mode", async () => {
    await act(async () => {
      root.render(React.createElement(TerminalPage));
    });

    expect(container.querySelector('[data-testid="standalone-terminal-workspace"]')).not.toBeNull();
    expect(container.querySelector(".terminal-single-header")).toBeNull();
  });

  it("forwards profile query param and macOptionIsMeta preference to TerminalPane in desktop mode", async () => {
    globalConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: "true" };
    localStorage.setItem("zenmind.terminal.macOptionIsMeta", "true");
    mockAgentKey = "coder";
    mockTerminalKey = "tab-profile";
    mockProfile = "wsl";

    await act(async () => {
      root.render(React.createElement(TerminalPage));
    });

    expect(capturedPaneProps).toHaveLength(1);
    expect(capturedPaneProps[0].initialProfile).toBe("wsl");
    expect(capturedPaneProps[0].macOptionIsMeta).toBe(true);
    expect(container.querySelector(".terminal-single-header")).toBeNull();
    expect(container.querySelector("header")).toBeNull();
  });
});

/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EngineSessionControls, EngineSessionNotice } from "./EngineSessionControls";
import { useEngineSession } from "../hooks/useEngineSession";
import { ApiError } from "@/shared/data/api/http";

jest.mock("@/shared/data/api/requests/agentEngine", () => ({
  previewEngineConfig: jest.fn(),
  prepareEngineSession: jest.fn(), getEngineSessionConfig: jest.fn(), configureEngineSession: jest.fn(),
  getEngineAuthStatus: jest.fn(), startEngineAuth: jest.fn(), cancelEngineAuth: jest.fn(),
}));
jest.mock("@/features/terminal/components/TerminalPane", () => ({ TerminalPane: () => null }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

let container: HTMLDivElement;
let root: Root;
let session: ReturnType<typeof useEngineSession>;
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = jest.fn().mockImplementation(() => ({matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}}));
});
beforeEach(() => {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  session = {
    busy: false, error: "", auth: null, terminal: false, canSend: true, pendingChatId: "chat",
    prepare: jest.fn(), configure: jest.fn(), startAuth: jest.fn(), cancelAuth: jest.fn(), verifyBeforeSend: jest.fn(),
    prepared: { chatId: "chat", engineId: "any/plugin", preparationId: "prepared", configRevision: 2, configOptions: [
      { id: "vendor-mode", category: "mode", type: "select", name: "Mode", currentValue: "read-only", choices: [{ value: "read-only", name: "Read-only" }, { value: "custom-review", name: "Custom review" }] },
      { id: "vendor-model", category: "model", type: "select", name: "Model", currentValue: "sol", choices: [{ value: "sol", name: "6.1 Sol" }, { value: "custom-model", name: "Other model" }] },
      { id: "vendor-thought", category: "thought_level", type: "select", name: "Reasoning effort", currentValue: "medium", choices: [{ value: "medium", name: "Medium" }, { value: "vendor-deep", name: "Deep" }] },
    ] },
  };
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render(running = false, compact = false) {
  await act(async () => root.render(<EngineSessionControls session={session} engineId="any/plugin" running={running} compact={compact} themeMode="light" />));
}
async function clickText(role: string, text: string) {
  const element = Array.from(document.querySelectorAll<HTMLElement>(role === "button" ? "button" : `[role="${role}"]`)).find(el => el.textContent?.includes(text));
  expect(element).toBeDefined();
  await act(async () => element!.click());
}
it("shows non-blocking configuration loading for a new Chat until preview options arrive", async () => {
  const api = jest.requireMock("@/shared/data/api/requests/agentEngine");
  let resolve!: (value: unknown) => void;
  api.previewEngineConfig.mockImplementation((_key: string, refresh: boolean) => refresh
    ? new Promise(done => { resolve = done; })
    : Promise.resolve({data: {engineId: "any/plugin", configOptions: []}}));
  const options = session.prepared!.configOptions;
  let current!: ReturnType<typeof useEngineSession>;
  function Composer() {
    current = useEngineSession({enabled: true, active: true, engineId: "any/plugin", agentKey: "project", chatId: "", draftChatId: "draft", running: false});
    return <EngineSessionControls session={current} engineId="any/plugin" running={false} themeMode="light" />;
  }
  await act(async () => root.render(<Composer />));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("acp.loadingConfig");
  expect(current.busy).toBe(false);
  expect(current.canSend).toBe(true);
  await act(async () => { resolve({data: {engineId: "any/plugin", configOptions: options}}); });
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.textContent).toContain("Read-only");
  expect(container.textContent).toContain("6.1 Sol · Medium");
});

it.each([false, true])("keeps discovery feedback while busy without hiding cached choices (cached=%s)", async cached => {
  jest.useFakeTimers();
  const api = jest.requireMock("@/shared/data/api/requests/agentEngine");
  const options = session.prepared!.configOptions;
  let refreshes = 0;
  api.previewEngineConfig.mockImplementation((_key: string, refresh: boolean) => {
    if (refresh && ++refreshes === 1) return Promise.reject(new ApiError("busy", {data: {errorCode: "engine_busy"}}));
    return Promise.resolve({data: {engineId: "any/plugin", configOptions: refresh || cached ? options : []}});
  });
  let current!: ReturnType<typeof useEngineSession>;
  function Composer() {
    current = useEngineSession({enabled: true, active: true, engineId: "any/plugin", agentKey: "project", chatId: "", draftChatId: "draft", running: false});
    return <EngineSessionControls session={current} engineId="any/plugin" running={false} themeMode="light" />;
  }
  try {
    await act(async () => root.render(<Composer />));
    if (cached) {
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent).toContain("6.1 Sol · Medium");
    } else expect(container.querySelector('[role="status"]')?.textContent).toBe("acp.loadingConfig");
    expect(current.canSend).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain("6.1 Sol · Medium");
  } finally { jest.useRealTimers(); }
});

it("ends preview loading with a visible retry on failure instead of a blank toolbar", async () => {
  const api = jest.requireMock("@/shared/data/api/requests/agentEngine");
  api.previewEngineConfig.mockRejectedValue(new ApiError("unavailable", {data: {errorCode: "engine_unavailable"}}));
  function Composer() {
    const current = useEngineSession({enabled: true, active: true, engineId: "any/plugin", agentKey: "project", chatId: "", draftChatId: "draft", running: false});
    return <EngineSessionControls session={current} engineId="any/plugin" running={false} themeMode="light" />;
  }
  await act(async () => root.render(<Composer />));
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("acp.connectionFailed");
  expect(container.textContent).toContain("acp.retry");
});

it("groups model and effort in a button menu and submits the plugin's exact config/value", async () => {
  await render();
  expect(container.querySelector('[role="combobox"]')).toBeNull();
  await clickText("button", "6.1 Sol");
  await clickText("menuitem", "Deep");
  expect(session.configure).toHaveBeenCalledWith("vendor-thought", "vendor-deep");
  // The old selection stays visible until Platform confirms the update.
  expect(container.textContent).toContain("Medium");
});

it("keeps external mode values distinct from native permission levels", async () => {
  await render();
  await clickText("button", "Read-only");
  await clickText("menuitem", "Custom review");
  expect(session.configure).toHaveBeenCalledWith("vendor-mode", "custom-review");
});
it.each(["running", "busy", "auth"])("disables configuration while %s", async state => {
  if (state === "busy") session.busy = true;
  if (state === "error") session.error = "session_configuration_stale";
  if (state === "auth") session.auth = { engineId: "any/plugin", state: "authenticating", methods: [] };
  await render(state === "running");
  expect(Array.from(container.querySelectorAll("button")).every(button => button.disabled)).toBe(true);
  expect(session.configure).not.toHaveBeenCalled();
});
it("keeps keyboard-reachable named controls in compact mode", async () => {
  await render(false, true);
  const button = container.querySelector<HTMLButtonElement>('button[aria-label*="6.1 Sol"]')!;
  expect(button).not.toBeNull();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  await clickText("menuitem", "Other model");
  expect(session.configure).toHaveBeenCalledWith("vendor-model", "custom-model");
});
it("puts unclassified settings in More settings and preserves boolean values", async () => {
  session.prepared!.configOptions.push({ id: "custom-toggle", type: "boolean", name: "Custom toggle", currentValue: false });
  await render();
  await clickText("button", "acp.moreSettings");
  await clickText("menuitem", "Custom toggle");
  expect(session.configure).toHaveBeenCalledWith("custom-toggle", true);
});
it("hides the normal status row but retains authentication and retry actions on failure", async () => {
  const notice = () => <EngineSessionNotice session={session} engineId="any/plugin" running={false} themeMode="light" />;
  await act(async () => root.render(notice()));
  expect(container.textContent).toBe("");
  session.error = "auth_required";
  session.auth = { engineId: "any/plugin", state: "required", methods: [{ id: "terminal-login", name: "Sign in", type: "terminal", available: true }] };
  await act(async () => root.render(notice()));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("acp.signInRequired");
  await clickText("button", "acp.login");
  await clickText("menuitem", "Sign in");
  expect(session.startAuth).toHaveBeenCalledWith("terminal-login");
  await clickText("button", "acp.retry");
  expect(session.prepare).toHaveBeenCalledTimes(1);
});

it('does not ask an active Run to prepare when its settings are not hydrated', async () => {
  session.prepared = null;
  await act(async () => root.render(<EngineSessionNotice session={session} engineId="any/plugin" running themeMode="light" />));
  expect(container.textContent).toBe('');
  session.error = 'auth_required';
  await act(async () => root.render(<EngineSessionNotice session={session} engineId="any/plugin" running themeMode="light" />));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('acp.signInRequired');
  expect(container.textContent).not.toContain('acp.retry');
});


it("shows only loading during automatic session preparation and hides it on success", async () => {
  const notice = () => <EngineSessionNotice session={session} engineId="any/plugin" running={false} themeMode="light" />;
  session.prepared = null;
  await act(async () => root.render(notice()));
  expect(container.textContent).toBe("");
  session.busy = true;
  await act(async () => root.render(notice()));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("acp.connecting");
  expect(container.querySelector("button")).toBeNull();
  session.busy = false;
  session.prepared = { chatId: "chat", engineId: "any/plugin", preparationId: "ready", configRevision: 1, configOptions: [] };
  await act(async () => root.render(notice()));
  expect(container.textContent).toBe("");
});


it("offers retry only after failure and hides it while retrying or authenticating", async () => {
  const notice = () => <EngineSessionNotice session={session} engineId="any/plugin" running={false} themeMode="light" />;
  session.prepared = null;
  session.error = "engine_unavailable";
  await act(async () => root.render(notice()));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("acp.connectionFailed");
  await clickText("button", "acp.retry");
  expect(session.prepare).toHaveBeenCalledTimes(1);
  session.busy = true;
  await act(async () => root.render(notice()));
  expect(container.querySelector("button")).toBeNull();
  session.busy = false;
  session.auth = { engineId:"any/plugin", state:"authenticating", methods:[] };
  await act(async () => root.render(notice()));
  expect(container.querySelector("button")).toBeNull();
});

// The same bottom-toolbar slot owns settings and transient status.
it("replaces settings with compact status and restores them when ready", async () => {
  session.busy = true;
  await render();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("acp.connecting");
  expect(container.textContent).not.toContain("6.1 Sol");
  session.busy = false;
  session.error = "engine_busy";
  await render();
  expect(container.querySelector('[role="alert"]')?.getAttribute("aria-label")).toBe("acp.busy");
  await clickText("button", "acp.retry");
  expect(session.prepare).toHaveBeenCalledTimes(1);
  session.error = "";
  await render();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("6.1 Sol");
});


it("keeps mode and model visible after sending and reopening a running Chat without preparing it", async () => {
  const api = jest.requireMock("@/shared/data/api/requests/agentEngine");
  api.prepareEngineSession.mockResolvedValue({ data: session.prepared });
  api.getEngineSessionConfig.mockResolvedValue({ data: session.prepared });
  function Composer({ chatId, running, enabled = true }: { chatId: string; running: boolean; enabled?: boolean }) {
    const current = useEngineSession({ enabled, active: !running, engineId: "any/plugin", agentKey: "project", chatId, running });
    return <EngineSessionControls session={current} engineId="any/plugin" running={running} themeMode="light" />;
  }
  const expectSettings = () => {
    expect(container.textContent).toContain("Read-only");
    expect(container.textContent).toContain("6.1 Sol · Medium");
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll("button")).every(button => button.disabled)).toBe(true);
  };
  await act(async () => root.render(<Composer chatId="chat" running={false} />));
  await act(async () => root.render(<Composer chatId="chat" running enabled={false} />));
  await act(async () => root.render(<Composer chatId="chat" running />));
  expectSettings();
  await act(async () => root.render(<div />));
  await act(async () => root.render(<Composer chatId="chat" running />));
  expectSettings();
  expect(api.prepareEngineSession).toHaveBeenCalledTimes(1);
  expect(api.configureEngineSession).not.toHaveBeenCalled();
});


it("retains confirmed mode and model while a pending prepare overlaps Run hydration", async () => {
  session.busy = true;
  await render(true);
  expect(container.textContent).toContain("Read-only");
  expect(container.textContent).toContain("6.1 Sol · Medium");
  expect(Array.from(container.querySelectorAll("button")).every(button => button.disabled)).toBe(true);
  expect(container.querySelector('[role="status"]')).toBeNull();
});

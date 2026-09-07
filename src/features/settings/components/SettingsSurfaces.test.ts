/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { Modal, Drawer } from "antd";
import { createInitialState, useAppState, useAppDispatch } from "@/app/state/AppContext";
import { ACCESS_TOKEN_STORAGE_KEY } from "@/app/state/constants";
import { getCurrentAccessToken, setAccessToken } from "@/shared/data";
import { isAppMode, isDesktopAppMode } from "@/shared/utils/routing";
import { isVoiceEnabled } from "@/shared/config/featureFlags";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { I18nProvider } from "@/shared/i18n";
import { SettingsModal } from "./SettingsModal";
import { SettingsDrawer } from "./SettingsDrawer";
import { SettingsTtsDebug } from "./SettingsTtsDebug";
import { SettingsAsrDebug } from "./SettingsAsrDebug";

jest.mock("antd", () => {
  const React = require("react");
  const surface = ({ open, children, onCancel, onClose, title, className }: any) =>
    open ? React.createElement("section", { className },
      React.createElement("h2", null, title),
      React.createElement("button", { onClick: onCancel || onClose }, "Close"),
      children,
    ) : null;
  return { Modal: jest.fn(surface), Drawer: jest.fn(surface) };
});
jest.mock("@/app/state/AppContext", () => ({
  ...jest.requireActual("@/app/state/AppContext"),
  useAppState: jest.fn(),
  useAppDispatch: jest.fn(),
}));
jest.mock("@/shared/data", () => ({
  getCurrentAccessToken: jest.fn(),
  setAccessToken: jest.fn(),
}));
jest.mock("@/shared/utils/routing", () => ({
  isAppMode: jest.fn(),
  isDesktopAppMode: jest.fn(),
}));
jest.mock("@/shared/config/featureFlags", () => ({ isVoiceEnabled: jest.fn() }));
jest.mock("@/features/voice/lib/voiceRuntime", () => ({ getVoiceRuntime: jest.fn() }));
jest.mock("./SettingsTtsDebug", () => ({ SettingsTtsDebug: jest.fn(() => null) }));
jest.mock("./SettingsAsrDebug", () => ({ SettingsAsrDebug: jest.fn(() => null) }));

function latestProps<T extends React.ElementType>(component: T): React.ComponentProps<T> {
  return (component as jest.Mock).mock.calls.at(-1)![0];
}

describe.each([
  ["modal", SettingsModal, Modal],
  ["drawer", SettingsDrawer, Drawer],
] as const)("settings %s", (variant, Settings, Surface) => {
  let container: HTMLDivElement;
  let root: Root;
  let state: ReturnType<typeof createInitialState>;
  const dispatch = jest.fn();
  const onClose = jest.fn();
  const resetVoiceRuntime = jest.fn();
  const debugSpeakTtsVoice = jest.fn();

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    debugSpeakTtsVoice.mockReset();
    (getCurrentAccessToken as jest.Mock).mockReturnValue(undefined);
    localStorage.clear();
    state = createInitialState();
    state.accessToken = "initial-token";
    (useAppState as jest.Mock).mockImplementation(() => state);
    (useAppDispatch as jest.Mock).mockReturnValue(dispatch);
    (isAppMode as jest.Mock).mockReturnValue(false);
    (isDesktopAppMode as jest.Mock).mockReturnValue(false);
    (isVoiceEnabled as jest.Mock).mockReturnValue(true);
    (getVoiceRuntime as jest.Mock).mockReturnValue({ resetVoiceRuntime, debugSpeakTtsVoice });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  function render(open = true) {
    act(() => root.render(React.createElement(I18nProvider, {
      locale: "en-US",
      children: React.createElement(Settings, { open, onClose }),
    })));
  }

  function input(id: string) {
    return container.querySelector<HTMLInputElement>(`#${id}`)!;
  }

  function change(id: string, value: string) {
    act(() => Simulate.change(input(id), { target: { value } } as any));
  }

  function click(text: string) {
    const button = Array.from(container.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === text);
    expect(button).toBeDefined();
    act(() => button!.click());
  }

  it("retains each shell's layout, close affordance and destruction options", () => {
    render();
    expect(latestProps(Surface)).toMatchObject({
      open: true, destroyOnHidden: true, getContainer: false,
      width: variant === "modal" ? "min(920px, calc(100vw - 32px))" : "100%",
      className: variant === "modal" ? "settings-modal" : "settings-drawer copilot-drawer",
    });
    if (variant === "modal") {
      expect(latestProps(Modal)).toMatchObject({ footer: null, onCancel: onClose });
      expect(container.querySelector(".settings-card")!.className).toContain("tw:overflow-auto");
      expect(container.querySelector(".settings-preferences-grid")!.className).toContain("tw:grid");
    } else {
      expect(latestProps(Drawer)).toMatchObject({
        onClose, mask: true, maskClosable: true, placement: "right",
        styles: { header: { borderBottom: 0, flex: "unset", padding: 10 } },
        closable: { closeIcon: expect.objectContaining({ props: { name: "keyboard_arrow_right" } }) },
      });
      expect(container.querySelector(".settings-card")!.className).toBe("settings-card");
      expect(container.querySelector(".settings-preferences-grid")!.className).toBe("settings-preferences-grid");
    }
  });

  it("saves a trimmed token, resets voice and refreshes workers before closing", () => {
    const events = jest.spyOn(window, "dispatchEvent");
    render();
    change("settings-token", "  new-token  ");
    click("Save");
    expect(setAccessToken).toHaveBeenCalledWith("new-token");
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe("new-token");
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACCESS_TOKEN", token: "new-token" });
    expect(resetVoiceRuntime).toHaveBeenCalledTimes(1);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: "agent:refresh-worker-data" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(resetVoiceRuntime.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it("keeps token drafts across controlled close/reopen, but initializes on remount", () => {
    render();
    change("settings-token", "unsaved");
    click("Close");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setAccessToken).not.toHaveBeenCalled();
    expect(resetVoiceRuntime).not.toHaveBeenCalled();
    render(false);
    expect(container.querySelector("#settings-token")).toBeNull();
    render();
    expect(input("settings-token").value).toBe("unsaved");
    act(() => root.render(null));
    render();
    expect(input("settings-token").value).toBe("initial-token");
  });

  it("synchronizes external token changes while open and closed", () => {
    render();
    change("settings-token", "draft");
    state = { ...state, accessToken: "external-open" };
    render();
    expect(input("settings-token").value).toBe("external-open");
    render(false);
    state = { ...state, accessToken: "external-closed" };
    render(false);
    render();
    expect(input("settings-token").value).toBe("external-closed");
  });

  it("keeps app credentials read-only and hides only the existing desktop theme controls", () => {
    (isAppMode as jest.Mock).mockReturnValue(true);
    (isDesktopAppMode as jest.Mock).mockReturnValue(true);
    (getCurrentAccessToken as jest.Mock).mockReturnValue("host-token");
    render();
    expect(input("settings-token").value).toBe("host-token");
    expect(input("settings-token").readOnly).toBe(true);
    expect(container.textContent).not.toContain("Save");
    expect(container.textContent).not.toContain("Theme");
    expect(container.textContent).toContain("Language");
    expect(latestProps(SettingsAsrDebug).accessToken).toBe("host-token");
    click("Close");
    expect(setAccessToken).not.toHaveBeenCalled();
  });

  it("applies theme and language immediately and retains refresh and clear actions", () => {
    const events = jest.spyOn(window, "dispatchEvent");
    render();
    click("Dark");
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_THEME_MODE", themeMode: "dark" });
    state = { ...state, themeMode: "dark" };
    render();
    expect(container.querySelector('[aria-label="Theme"] [aria-selected="true"]')!.textContent).toBe("Dark");
    click("Refresh agents");
    click("Refresh teams");
    click("Clear logs");
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: "agent:refresh-agents" }));
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: "agent:refresh-teams" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_DEBUG" });
    expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_EVENTS" });
    click("Chinese");
    expect(container.textContent).toContain("默认语言");
  });

  it("preserves a focused gate draft on config updates and commits against the latest config", () => {
    render();
    act(() => Simulate.focus(input("client-gate-threshold")));
    change("client-gate-threshold", "0.03");
    state = { ...state, voiceChat: { ...state.voiceChat,
      clientGate: { ...state.voiceChat.clientGate, rmsThreshold: 0.02, openHoldMs: 222 },
    } };
    render();
    expect(input("client-gate-threshold").value).toBe("0.03");
    expect(input("client-gate-open-hold").value).toBe("222");
    act(() => Simulate.blur(input("client-gate-threshold")));
    expect(dispatch).toHaveBeenCalledWith({ type: "PATCH_VOICE_CHAT", patch: {
      clientGate: { ...state.voiceChat.clientGate, rmsThreshold: 0.03 },
      clientGateCustomized: true,
    } });
    change("client-gate-open-hold", "invalid");
    dispatch.mockClear();
    act(() => Simulate.blur(input("client-gate-open-hold")));
    expect(input("client-gate-open-hold").value).toBe("222");
    expect(dispatch).not.toHaveBeenCalled();
    change("client-gate-threshold", "unfinished");
    render(false);
    render();
    expect(input("client-gate-threshold").value).toBe("0.02");
  });

  it("retains TTS send/error/stop and ASR callback wiring", async () => {
    const events = jest.spyOn(window, "dispatchEvent");
    render();
    expect(latestProps(SettingsTtsDebug)).toMatchObject({ active: true, ttsDebugStatus: state.ttsDebugStatus });
    await act(async () => latestProps(SettingsTtsDebug).onSend("  hello  "));
    expect(debugSpeakTtsVoice).toHaveBeenCalledWith("hello");
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_TTS_DEBUG_STATUS", status: "sending..." });
    debugSpeakTtsVoice.mockRejectedValueOnce(new Error("offline"));
    await act(async () => latestProps(SettingsTtsDebug).onSend("hello"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_TTS_DEBUG_STATUS", status: "error: offline" });
    await act(async () => latestProps(SettingsTtsDebug).onSend(" "));
    expect(debugSpeakTtsVoice).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_TTS_DEBUG_STATUS", status: "Error: empty text" });
    act(() => latestProps(SettingsTtsDebug).onStop());
    expect(events).toHaveBeenCalledWith(expect.objectContaining({
      type: "agent:voice-stop-all", detail: { reason: "debug_stop", mode: "stop" },
    }));
    expect(latestProps(SettingsAsrDebug)).toMatchObject({
      appMode: false, accessToken: state.accessToken, chatId: state.chatId,
      speechRate: state.voiceChat.speechRate, capabilities: state.voiceChat.capabilities,
      clientGate: state.voiceChat.clientGate, clientGateCustomized: state.voiceChat.clientGateCustomized,
      onDispatch: dispatch,
    });
    act(() => latestProps(SettingsAsrDebug).onAccessTokenResolved("resolved"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACCESS_TOKEN", token: "resolved" });
    act(() => latestProps(SettingsAsrDebug).onPatchVoiceChat({ speechRate: 1.2 }));
    expect(dispatch).toHaveBeenCalledWith({ type: "PATCH_VOICE_CHAT", patch: { speechRate: 1.2 } });
  });

  it("retains the existing voice feature flag", () => {
    (isVoiceEnabled as jest.Mock).mockReturnValue(false);
    render();
    expect(container.querySelector("#client-gate-enabled")).toBeNull();
    expect(SettingsTtsDebug).not.toHaveBeenCalled();
    expect(SettingsAsrDebug).not.toHaveBeenCalled();
    expect(input("settings-token")).not.toBeNull();
  });
});

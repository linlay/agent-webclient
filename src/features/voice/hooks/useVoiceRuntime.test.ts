/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { useVoiceRuntime } from "./useVoiceRuntime";

const mockInit = jest.fn();
const mockRuntime = { setMuted: jest.fn(), resetVoiceRuntime: jest.fn() };
const mockState = createInitialState();
const mockDispatch = jest.fn();
const mockStateRef = { current: mockState };
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: mockState, stateRef: mockStateRef, dispatch: mockDispatch }),
}));
jest.mock("@/features/voice/lib/voiceRuntime", () => ({
  initVoiceRuntime: (...args: unknown[]) => mockInit(...args),
  getVoiceRuntime: () => null,
}));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true,
    __AGENT_WEBCLIENT_RUNTIME_CONFIG__: { VOICE_ENABLED: "true" } });
  jest.clearAllMocks();
  mockInit.mockReturnValue(mockRuntime);
});

it("does not create a voice runtime or subscribe to voice events while disabled", () => {
  const listener = jest.spyOn(window, "addEventListener");
  const root = createRoot(document.createElement("div"));
  function Harness() { useVoiceRuntime(); return null; }
  try {
    act(() => root.render(React.createElement(Harness)));
    expect(mockInit).not.toHaveBeenCalled();
    expect(listener.mock.calls.some(([type]) => String(type).startsWith("agent:voice-"))).toBe(false);
  } finally { act(() => root.unmount()); listener.mockRestore(); }
});

it("keeps the retained runtime testable through an explicit enabled input", () => {
  const root = createRoot(document.createElement("div"));
  function Harness() { useVoiceRuntime({ enabled: true }); return null; }
  act(() => root.render(React.createElement(Harness)));
  expect(mockInit).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  expect(mockRuntime.resetVoiceRuntime).toHaveBeenCalledTimes(1);
});

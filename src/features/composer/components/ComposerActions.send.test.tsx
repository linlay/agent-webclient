/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ComposerActions } from "./ComposerActions";

const mockHandleSend = jest.fn();
jest.mock("@/features/composer/components/ComposerContext", () => ({
  useComposerContext: () => ({ handleSend: mockHandleSend }),
}));
jest.mock("@/features/composer/components/ControlsForm", () => ({ ControlsForm: () => null }));
jest.mock("@/features/composer/components/QuerySettingsControls", () => ({ QuerySettingsControls: () => null }));
jest.mock("@/features/composer/components/ComposerAddMenu", () => ({ AddMenuTrigger: () => null }));
jest.mock("@/features/connectors/components/AgentConnectorPicker", () => ({ AgentConnectorPicker: () => null }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

function renderActions(overrides: Record<string, unknown> = {}) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<ComposerActions
    accessLevel="ask_for_approval" isFrontendActive={false} isVoiceMode={false} isStreaming={false}
    canCaptureDesktopScreenshot={false} isCapturingDesktopScreenshot={false} modelOverride={{}}
    planningMode={false} canUsePlanningMode={false} editingMode={false} canUseEditingMode={false}
    currentChatId="chat" currentAgentKey="agent" isMainChatRunning={false} selectedSkillIds={["word"]}
    lockedSkillIds={["word"]} onSelectSkills={jest.fn()} onSelectSkill={jest.fn()}
    voiceEnabled={false} hasUploadingAttachments={false} speechListening={false} speechSupported={false}
    speechStatus="ready" sendDisabled={false}
    onAccessLevelChange={jest.fn()} onControlParamsChange={jest.fn()}
    onModelOverrideChange={jest.fn()} onTogglePlanningMode={jest.fn()} onEditingModeChange={jest.fn()} onAddReference={jest.fn()}
    {...overrides}
  />));
  const button = container.querySelector<HTMLButtonElement>("#send-btn");
  const cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { container, button, cleanup };
}

beforeEach(() => {
  mockHandleSend.mockReset();
});

test.each([
  { running: false, disabled: false },
  { running: true, disabled: false },
  { running: false, disabled: true },
])("send button excludes the click event from send options: %j", ({ running, disabled }) => {
  const view = renderActions({ isMainChatRunning: running, sendDisabled: disabled });
  try {
    expect(view.button).not.toBeNull();
    act(() => view.button!.click());
    if (disabled) {
      expect(mockHandleSend).not.toHaveBeenCalled();
    } else {
      expect(mockHandleSend).toHaveBeenCalledTimes(1);
      // Passing a MouseEvent here makes ComposerArea treat the click as directSteer=true.
      expect(mockHandleSend).toHaveBeenCalledWith();
    }
  } finally {
    view.cleanup();
  }
});

test("streaming send steers the active run instead of queueing a query", () => {
  const view = renderActions({ isStreaming: true });
  try {
    expect(view.button).not.toBeNull();
    expect(view.button!.getAttribute("aria-label")).toBe("composer.steer.submit");
    act(() => view.button!.click());
    expect(mockHandleSend).toHaveBeenCalledWith(true);
    // 发送与中断互斥：出现引导按钮时不再渲染中断按钮。
    expect(view.container.querySelector("#interrupt-btn")).toBeNull();
  } finally {
    view.cleanup();
  }
});

test("streaming without a usable steer keeps the interrupt button", () => {
  const view = renderActions({ isStreaming: true, sendDisabled: true });
  try {
    expect(view.button).toBeNull();
    expect(view.container.querySelector("#interrupt-btn")).not.toBeNull();
  } finally {
    view.cleanup();
  }
});

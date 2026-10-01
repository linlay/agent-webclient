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

test.each([
  { running: false, disabled: false },
  { running: true, disabled: false },
  { running: false, disabled: true },
])("send button excludes the click event from send options: %j", ({ running, disabled }) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mockHandleSend.mockReset();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<ComposerActions
      accessLevel="default" isFrontendActive={false} isVoiceMode={false} isStreaming={false}
      canCaptureDesktopScreenshot={false} isCapturingDesktopScreenshot={false} modelOverride={{}}
      planningMode={false} canUsePlanningMode={false} editingMode={false} canUseEditingMode={false}
      currentChatId="chat" currentAgentKey="agent" isMainChatRunning={running} selectedSkillIds={["word"]}
      lockedSkillIds={["word"]} onSelectSkills={jest.fn()} onSelectSkill={jest.fn()}
      voiceEnabled={false} hasUploadingAttachments={false} speechListening={false} speechSupported={false}
      speechStatus="ready" sendDisabled={disabled} onAccessLevelChange={jest.fn()} onControlParamsChange={jest.fn()}
      onModelOverrideChange={jest.fn()} onTogglePlanningMode={jest.fn()} onEditingModeChange={jest.fn()} onAddReference={jest.fn()}
    />));
    const button = container.querySelector<HTMLButtonElement>("#send-btn")!;
    expect(button).not.toBeNull();
    act(() => button.click());
    if (disabled) {
      expect(mockHandleSend).not.toHaveBeenCalled();
    } else {
      expect(mockHandleSend).toHaveBeenCalledTimes(1);
      // Passing a MouseEvent here makes ComposerArea treat the click as directSteer=true.
      expect(mockHandleSend).toHaveBeenCalledWith();
    }
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

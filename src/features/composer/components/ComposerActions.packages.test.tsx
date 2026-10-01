/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ComposerActions } from "./ComposerActions";

const skills = [
  { id: "word", displayName: "Word", configured: false },
  { id: "excel", displayName: "Excel", configured: false },
];
jest.mock("@/features/composer/components/ComposerContext", () => ({
  useComposerContext: () => ({ captureDesktopScreenshot: jest.fn(), openFilePicker: jest.fn(), interruptCurrentRun: jest.fn(), toggleSpeechInput: jest.fn(), handleSend: jest.fn() }),
}));
jest.mock("@/features/composer/components/ControlsForm", () => ({ ControlsForm: () => null }));
jest.mock("@/features/composer/components/QuerySettingsControls", () => ({ QuerySettingsControls: () => null }));
jest.mock("@/features/connectors/components/AgentConnectorPicker", () => ({ AgentConnectorPicker: () => null }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/features/composer/hooks/useComposerSkillMenuQuery", () => ({
  useComposerSkillMenuQuery: () => ({
    status: "success", error: null, pinnedSkillIds: [], toggleSkillPin: jest.fn(), pinsDisabled: false, pinError: null, refreshPins: jest.fn(), refetch: jest.fn(),
    data: { skills, packages: [{ id: "office", name: "Office", version: "1", skills: [{ id: "word" }, { id: "excel" }], missingSkillIds: [], status: "ready" }] },
  }),
}));
jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  return {
    ...actual,
    Popover: ({ children, content, open, onOpenChange }: any) => <div>{React.cloneElement(children, { onClick: (event: React.MouseEvent) => { children.props.onClick?.(event); onOpenChange?.(!open); } })}{open ? content : null}</div>,
  };
});

/** Exercises the real Actions -> AddMenu -> PackageSkillTree path, not just the leaf. */
test("Actions forwards bulk selection and locked member IDs to the real package menu", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const onSelectSkills = jest.fn();
  try {
    act(() => root.render(<ComposerActions
      accessLevel="default" isFrontendActive={false} isVoiceMode={false} isStreaming={false}
      canCaptureDesktopScreenshot={false} isCapturingDesktopScreenshot={false} modelOverride={{}}
      planningMode={false} canUsePlanningMode={false} editingMode={false} canUseEditingMode={false}
      currentChatId="chat" currentAgentKey="agent" isMainChatRunning={false} selectedSkillIds={["word"]}
      lockedSkillIds={["word"]} onSelectSkills={onSelectSkills} onSelectSkill={jest.fn()}
      voiceEnabled={false} hasUploadingAttachments={false} speechListening={false} speechSupported={false}
      speechStatus="ready" sendDisabled={false} onAccessLevelChange={jest.fn()} onControlParamsChange={jest.fn()}
      onModelOverrideChange={jest.fn()} onTogglePlanningMode={jest.fn()} onEditingModeChange={jest.fn()} onAddReference={jest.fn()}
    />));
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="composer.addMenu.open"]')!.click());
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent?.includes("composer.addMenu.section.skills"))!;
    act(() => section.click());
    const parent = container.querySelector<HTMLButtonElement>('button[aria-label="packageComposer.select"]')!;
    expect(parent).not.toBeNull();
    expect(parent.disabled).toBe(false);
    act(() => parent.click());
    expect(onSelectSkills).toHaveBeenCalledWith(skills, true);
    const word = container.querySelector<HTMLButtonElement>('button[aria-label="Word"]')!;
    expect(word.disabled).toBe(true);
  } finally { act(() => root.unmount()); container.remove(); }
});

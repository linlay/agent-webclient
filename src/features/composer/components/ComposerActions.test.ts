import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerActions } from "@/features/composer/components/ComposerActions";

jest.mock("@/features/composer/components/ComposerContext", () => ({
  useComposerContext: () => ({
    captureDesktopScreenshot: jest.fn(),
    openFilePicker: jest.fn(),
    interruptCurrentRun: jest.fn(),
    toggleSpeechInput: jest.fn(),
    handleSend: jest.fn(),
  }),
}));

jest.mock("@/features/composer/components/ControlsForm", () => ({
  ControlsForm: () => React.createElement("div", { className: "controls-form" }),
}));

jest.mock("@/features/composer/components/QuerySettingsControls", () => ({
  QuerySettingsControls: ({ showModelSelector }: { showModelSelector?: boolean }) =>
    React.createElement(
      "div",
      {
        className: "query-settings-controls",
        "data-show-model": String(showModelSelector !== false),
      },
      "权限",
    ),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("ComposerActions", () => {
  const baseProps = {
    accessLevel: "default" as const,
    isFrontendActive: false,
    isVoiceMode: false,
    isStreaming: false,
    modelOverride: {},
    planningMode: false,
    canUsePlanningMode: true,
    editingMode: false,
    canUseEditingMode: false,
    currentChatId: "",
    currentSkillKeys: [],
    selectedSkill: null,
    voiceEnabled: true,
    hasUploadingAttachments: false,
    canCaptureDesktopScreenshot: false,
    isCapturingDesktopScreenshot: false,
    speechListening: false,
    speechSupported: true,
    speechStatus: "ready",
    sendDisabled: false,
    onAccessLevelChange: jest.fn(),
    onControlParamsChange: jest.fn(),
    onModelOverrideChange: jest.fn(),
    onTogglePlanningMode: jest.fn(),
    onEditingModeChange: jest.fn(),
    onAddReference: jest.fn(),
    onSelectedSkillChange: jest.fn(),
  };

  it("renders permission controls and interrupt while streaming", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        isStreaming: true,
      }),
    );

    expect(html).toContain("query-settings-controls");
    expect(html).toContain('data-show-model="true"');
    expect(html).toContain("interrupt-btn");
  });

  it("hides send and voice controls while streaming", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        isStreaming: true,
      }),
    );

    expect(html).not.toContain("send-btn");
    expect(html).not.toContain("voice-btn");
  });

  it("renders desktop screenshot action when the bridge is available", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        canCaptureDesktopScreenshot: true,
      }),
    );

    expect(html).toContain("desktop-screenshot-btn");
    expect(html).toContain("composer.actions.screenshot");
  });

  it("hides desktop screenshot action when the bridge is unavailable", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        canCaptureDesktopScreenshot: false,
      }),
    );

    expect(html).not.toContain("desktop-screenshot-btn");
  });

  it("renders editing as a removable active tag instead of a persistent switch", () => {
    const enabledHtml = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        editingMode: true,
        canUseEditingMode: true,
      }),
    );
    const disabledHtml = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        canUseEditingMode: true,
      }),
    );

    expect(enabledHtml).toContain("composer-context-toggle-btn");
    expect(enabledHtml).toContain('data-material-icon="edit_square"');
    expect(enabledHtml).toContain("composer.editingMode.label");
    expect(enabledHtml).not.toContain("ant-switch");
    expect(disabledHtml).not.toContain("composer.editingMode.label");
  });

  it("renders the selected skill as a removable required-skill tag", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        currentSkillKeys: [{ key: "product-design", label: "Product Design" }],
        selectedSkill: { key: "product-design", label: "Product Design" },
      }),
    );

    expect(html).toContain("composer.addMenu.skill.requiredBadge");
    expect(html).toContain("Product Design");
    expect(html).toContain('data-material-icon="skills"');
  });
});

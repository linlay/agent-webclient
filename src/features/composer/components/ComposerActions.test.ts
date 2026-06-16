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
});

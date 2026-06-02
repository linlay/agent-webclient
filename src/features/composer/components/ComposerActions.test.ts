import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerActions } from "@/features/composer/components/ComposerActions";

jest.mock("@/features/composer/components/ComposerContext", () => ({
  useComposerContext: () => ({
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
    expect(html).toContain('data-show-model="false"');
    expect(html).toContain("interrupt-btn");
  });

  it("hides send, voice, and model selector controls while streaming", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        isStreaming: true,
      }),
    );

    expect(html).not.toContain("send-btn");
    expect(html).not.toContain("voice-btn");
    expect(html).not.toContain('data-show-model="true"');
  });
});

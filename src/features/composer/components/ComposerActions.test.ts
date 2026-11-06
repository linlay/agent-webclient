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
    accessLevel: "ask_for_approval" as const,
    isFrontendActive: false,
    isVoiceMode: false,
    isStreaming: false,
    modelOverride: {},
    planningMode: false,
    canUsePlanningMode: true,
    editingMode: false,
    canUseEditingMode: false,
    currentChatId: "",
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

  it.each([false, true])("uses session settings in the bottom action row, including while running=%s", (running) => {
    const html = renderToStaticMarkup(React.createElement(ComposerActions, {
      ...baseProps, isStreaming: running,
      renderSettings: (_compact: boolean, disabled: boolean) => React.createElement("button", { disabled }, "Plugin model"),
    } as any));
    expect(html).toContain("Plugin model");
    expect(html).not.toContain("query-settings-controls");
    expect(html.indexOf("Plugin model")).toBeGreaterThan(html.indexOf("composer-control-row"));
    expect(html.indexOf("Plugin model")).toBeLessThan(html.indexOf(running ? 'id="interrupt-btn"' : 'id="send-btn"'));
    expect(html.includes('<button disabled="">Plugin model')).toBe(running);
  });

  it("shows an inline status while keeping Stop available for an existing run", () => {
    const html = renderToStaticMarkup(React.createElement(ComposerActions, {
      ...baseProps, isStreaming: true, interactionDisabled: true, interruptDisabled: false,
      statusNotice: React.createElement("span", { role: "status" }, "Agent unavailable"),
    }));
    expect(html).toContain("Agent unavailable");
    expect(html).not.toContain("composer-plus-btn");
    const stop = html.match(/<button[^>]*id="interrupt-btn"[^>]*>/)?.[0];
    expect(stop).toBeDefined();
    expect(stop).not.toMatch(/\sdisabled(?:=|\s|>)/);
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

  it("keeps the screenshot action out of the control row so the add menu owns it", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        canCaptureDesktopScreenshot: true,
      }),
    );

    expect(html).toContain("composer-plus-btn");
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
    expect(enabledHtml).not.toContain("ant-switch");
    expect(disabledHtml).not.toContain("composer.editingMode.label");
  });

  it("renders enabled connectors avatar stack when available", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        planningMode: true,
        canUsePlanningMode: true,
        enabledConnectors: [
          { id: "conn-1", name: "Connector 1" },
          { id: "conn-2", name: "Connector 2" },
        ],
      } as any),
    );

    expect(html).toContain("composer-connector-stack-btn");
    expect(html).toContain("composer-connector-avatar-stack");
    expect(html).toContain("Connector 1");
    // 堆叠与展开偏移由 CSS 变量驱动，展开只靠绝对定位的 transform，不占用布局
    expect(html).toContain("--connector-avatar-count:2");
    expect(html).toContain("--connector-avatar-index:1");
  });
});


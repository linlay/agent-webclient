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
        sendDisabled: true,
      }),
    );

    expect(html).toContain("query-settings-controls");
    expect(html).toContain('data-show-model="true"');
    expect(html).toContain("interrupt-btn");
  });

  it("shows an inline status while keeping Stop available for an existing run", () => {
    const html = renderToStaticMarkup(React.createElement(ComposerActions, {
      ...baseProps, isStreaming: true, sendDisabled: true, interactionDisabled: true, interruptDisabled: false,
      statusNotice: React.createElement("span", { role: "status" }, "Agent unavailable"),
    }));
    expect(html).toContain("Agent unavailable");
    expect(html).not.toContain("composer-plus-btn");
    const stop = html.match(/<button[^>]*id="interrupt-btn"[^>]*>/)?.[0];
    expect(stop).toBeDefined();
    expect(stop).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("keeps interrupt instead of send while streaming without steerable content", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        isStreaming: true,
        sendDisabled: true,
      }),
    );

    expect(html).not.toContain("send-btn");
    expect(html).toContain("interrupt-btn");
    expect(html).not.toContain("voice-btn");
  });

  it("replaces interrupt with the steer send while streaming with steerable content", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        isStreaming: true,
      }),
    );

    expect(html).toContain("send-btn");
    expect(html).toContain('aria-label="composer.steer.submit"');
    // 发送与中断互斥：能引导时不再渲染停止按钮。
    expect(html).not.toContain("interrupt-btn");
    // 运行中发的是引导，不是新一轮 query，也不出现语音按钮。
    expect(html).not.toContain("voice-btn");
  });

  it("keeps interrupt in voice mode even when steerable", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        isStreaming: true,
        isVoiceMode: true,
      }),
    );

    // 语音模式没有文本发送入口，位置仍留给中断。
    expect(html).not.toContain("send-btn");
    expect(html).toContain("interrupt-btn");
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

  it("keeps the avatar stack for mounted connectors and marks an unavailable one", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerActions, {
        ...baseProps,
        planningMode: true,
        canUsePlanningMode: true,
        enabledConnectors: [
          { id: "conn-1", name: "Connector 1", availability: { state: "ready" } },
          { id: "conn-2", name: "Connector 2", availability: { state: "unavailable", reason: "account_disconnected" } },
        ],
      } as any),
    );

    expect(html).toContain("composer-connector-stack-btn");
    expect(html).toContain("composer-connector-avatar-stack");
    expect(html).toContain("Connector 1");
    expect(html).toContain('data-unavailable="true"');
    expect(html).toContain("status.account_disconnected");
    // 堆叠与展开偏移由 CSS 变量驱动，展开只靠绝对定位的 transform，不占用布局
    expect(html).toContain("--connector-avatar-count:2");
    expect(html).toContain("--connector-avatar-index:1");
  });
});


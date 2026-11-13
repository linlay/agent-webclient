/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ComposerActions } from "./ComposerActions";

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
  ControlsForm: () => null,
}));
jest.mock("@/features/composer/components/QuerySettingsControls", () => ({
  QuerySettingsControls: () => null,
}));
jest.mock("@/features/composer/components/ComposerAddMenu", () => ({
  AddMenuTrigger: () => null,
}));
jest.mock("@/features/connectors/components/AgentConnectorPicker", () => ({
  AgentConnectorPicker: () =>
    React.createElement("div", { "data-connector-picker": "true" }),
}));
jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

// 内联渲染展开的 Popover 内容，便于直接断言浮层是否还在文档里。
jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  return {
    ...actual,
    Popover: ({ children, content, open, onOpenChange }: any) =>
      React.createElement(
        "div",
        null,
        React.cloneElement(children, {
          onClick: (event: React.MouseEvent) => {
            children.props.onClick?.(event);
            onOpenChange?.(!open);
          },
        }),
        open ? React.createElement("div", null, content) : null,
      ),
  };
});

const baseProps = {
  accessLevel: "ask_for_approval" as const,
  isFrontendActive: false,
  isVoiceMode: false,
  isStreaming: false,
  canCaptureDesktopScreenshot: false,
  isCapturingDesktopScreenshot: false,
  modelOverride: {},
  planningMode: false,
  canUsePlanningMode: false,
  editingMode: false,
  canUseEditingMode: false,
  currentChatId: "chat-a",
  currentAgentKey: "agent-a",
  isMainChatRunning: false,
  selectedSkillIds: [],
  lockedSkillIds: [],
  onSelectSkills: jest.fn(),
  onSelectSkill: jest.fn(),
  voiceEnabled: false,
  hasUploadingAttachments: false,
  speechListening: false,
  speechSupported: false,
  speechStatus: "ready",
  sendDisabled: false,
  onAccessLevelChange: jest.fn(),
  onControlParamsChange: jest.fn(),
  onModelOverrideChange: jest.fn(),
  onTogglePlanningMode: jest.fn(),
  onEditingModeChange: jest.fn(),
  onAddReference: jest.fn(),
  enabledConnectors: [
    { id: "conn-1", name: "Connector 1" },
    { id: "conn-2", name: "Connector 2" },
  ],
};

function renderActions() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (overrides: Record<string, unknown> = {}) =>
    act(() =>
      root.render(
        React.createElement(ComposerActions, {
          ...baseProps,
          ...overrides,
        } as any),
      ),
    );
  const trigger = () =>
    container.querySelector<HTMLButtonElement>(
      '[aria-label="composer.addMenu.section.connectors"]',
    )!;
  const picker = () => container.querySelector("[data-connector-picker]");
  render();
  return {
    root,
    render,
    trigger,
    picker,
    openPicker: () => act(() => trigger().click()),
  };
}

describe("ComposerActions connector picker", () => {
  it("closes the picker when switching to another chat", () => {
    const view = renderActions();
    try {
      view.openPicker();
      expect(view.picker()).not.toBeNull();

      view.render({ currentChatId: "chat-b" });
      expect(view.picker()).toBeNull();
    } finally {
      act(() => view.root.unmount());
    }
  });

  it("closes the picker when the agent changes", () => {
    const view = renderActions();
    try {
      view.openPicker();
      expect(view.picker()).not.toBeNull();

      view.render({ currentAgentKey: "agent-b", currentChatId: "chat-b" });
      expect(view.picker()).toBeNull();
    } finally {
      act(() => view.root.unmount());
    }
  });

  it("closes the picker as soon as the composer is blocked by a conversation switch", () => {
    const view = renderActions();
    try {
      view.openPicker();
      expect(view.picker()).not.toBeNull();

      // Desktop 侧栏已切走但目标 chat 还没加载完，currentChatId 仍是旧值。
      view.render({ interactionDisabled: true });
      expect(view.picker()).toBeNull();
    } finally {
      act(() => view.root.unmount());
    }
  });
});

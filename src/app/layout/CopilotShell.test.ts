import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import { CopilotShell } from "@/app/layout/CopilotShell";

jest.mock("@/app/state/AppContext", () => ({
  useAppState: jest.fn(),
  useAppDispatch: jest.fn(),
}));

jest.mock("@/app/layout/hooks/useAppRuntimes", () => ({
  useAppRuntimes: jest.fn(),
}));

jest.mock("@/features/timeline/components/ConversationStage", () => ({
  ConversationStage: (props: { showEmptyState?: boolean }) =>
    React.createElement(
      "main",
      {
        className: "conversation-stage",
        "data-show-empty-state": String(props.showEmptyState),
      },
      "stage",
    ),
}));

jest.mock("@/app/layout/BottomDock", () => ({
  BottomDock: (props: { mode?: string }) =>
    React.createElement(
      "footer",
      { className: "bottom-dock", "data-mode": props.mode || "" },
      "dock",
    ),
}));

jest.mock("@/app/layout/LeftSidebar", () => ({
  LeftSidebar: () =>
    React.createElement("aside", { className: "left-sidebar" }, "left sidebar"),
}));

jest.mock("@/app/layout/sidebar/right/RightSidebar", () => ({
  RightSidebar: () =>
    React.createElement(
      "aside",
      { className: "right-sidebar" },
      "right sidebar",
    ),
}));

jest.mock("@/app/layout/TerminalDock", () => ({
  TerminalDock: () =>
    React.createElement("section", { className: "terminal-dock" }, "terminal"),
}));

jest.mock("@/app/layout/CommandStatusOverlay", () => ({
  CommandStatusOverlay: () => (
    React.createElement(
      "div",
      { className: "command-status-overlay" },
      "status overlay",
    )
  ),
}));

jest.mock("@/app/layout/sidebar/right/AttachmentPreviewPanel", () => ({
  AttachmentPreviewPanel: () => (
    React.createElement(
      "div",
      { className: "attachment-preview-panel" },
      "attachment preview",
    )
  ),
}));

jest.mock("@/app/layout/sidebar/right/DebugTab", () => ({
  DebugTab: () =>
    React.createElement("div", { className: "debug-tab" }, "debug tab"),
}));

jest.mock("@/app/layout/sidebar/right/OverviewTab", () => ({
  OverviewTab: () =>
    React.createElement("div", { className: "overview-tab" }, "overview tab"),
}));

jest.mock("@/features/settings/components/SettingsModal", () => ({
  SettingsModal: () =>
    React.createElement("div", { className: "settings-modal" }, "settings"),
}));

jest.mock("@/features/settings/components/MemoryInfoModal", () => ({
  MemoryInfoModal: () =>
    React.createElement("div", { className: "memory-info-modal" }, "memory"),
}));

jest.mock("@/features/settings/components/ArchiveModal", () => ({
  ArchiveModal: () =>
    React.createElement("div", { className: "archive-modal" }, "archive"),
}));

jest.mock("@/app/modals/CommandModal", () => ({
  CommandModal: () =>
    React.createElement("div", { className: "command-modal" }, "command"),
}));

jest.mock("@/app/modals/ActionModal", () => ({
  ActionModal: () =>
    React.createElement("div", { className: "action-modal" }, "action"),
}));

jest.mock("@/app/modals/EventPopover", () => ({
  EventPopover: () =>
    React.createElement("div", { className: "event-popover" }, "event"),
}));

jest.mock("@/app/effects/FireworksCanvas", () => ({
  FireworksCanvas: () =>
    React.createElement("canvas", { className: "fireworks-canvas" }),
}));

jest.mock("@/shared/config/featureFlags", () => ({
  isDebugPanelEnabled: jest.fn(() => true),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.shortcut ? `${key} ${params.shortcut}` : key,
  }),
}));

const { useAppState, useAppDispatch } = jest.requireMock(
  "@/app/state/AppContext",
) as {
  useAppState: jest.Mock;
  useAppDispatch: jest.Mock;
};

const { useAppRuntimes } = jest.requireMock(
  "@/app/layout/hooks/useAppRuntimes",
) as {
  useAppRuntimes: jest.Mock;
};

const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

describe("CopilotShell", () => {
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(jest.fn());
    useAppRuntimes.mockClear();
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it("renders the compact Copilot layout with stage and dock", () => {
    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).toContain("layout-copilot");
    expect(html).toContain("copilot-topbar");
    expect(html).toContain("conversation-stage");
    expect(html).toContain("bottom-dock");
    expect(html).toContain('data-show-empty-state="false"');
    expect(html).toContain('data-mode="copilot"');
    expect(html).toContain("command-modal");
    expect(useAppRuntimes).toHaveBeenCalledTimes(1);
  });

  it("renders a single-line top bar without voice or mute controls", () => {
    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).toContain("copilot-topbar-row");
    expect(html).toContain("copilot-title-block");
    expect(html).toContain("copilot-worker-switch-btn");
    expect(html).toContain("swap_horiz");
    expect(html).toContain("edit_square");
    expect(html).toContain("history");
    expect(html).toContain("settings");
    expect(html).not.toContain(">call<");
    expect(html).not.toContain(">call_end<");
    expect(html).not.toContain("volume_up");
    expect(html).not.toContain("volume_off");
  });

  it("does not render desktop-only shell chrome", () => {
    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).not.toContain("left-sidebar");
    expect(html).not.toContain("right-sidebar");
    expect(html).not.toContain("terminal-dock");
  });

  it("renders the compact side panel for reused right-sidebar content", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      rightSidebarOpen: true,
      rightSidebarOpenTab: "overview",
    });

    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).toContain("copilot-side-panel");
    expect(html).toContain("overview-tab");
  });
});

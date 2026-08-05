import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AddMenuPopover, AddMenuTrigger } from "@/features/composer/components/ComposerAddMenu";

jest.mock("antd", () => ({
  Popover: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "add-menu-popover" },
      children,
      React.createElement(
        "div",
        { "data-testid": "add-menu-content" },
        content,
      ),
    ),
  Typography: {
    Text: ({ children, ...rest }: Record<string, unknown>) =>
      React.createElement("span", rest, children),
  },
}));

jest.mock("@/shared/data", () => ({
  getChats: () => Promise.resolve({ data: [] }),
}));

jest.mock("@/shared/data/desktop/desktopWebs", () => ({
  canUseDesktopWebsBridge: () => false,
  listDesktopWebEntries: () => Promise.resolve([]),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({
    children,
    "aria-label": ariaLabel,
    ...rest
  }: Record<string, unknown>) =>
    React.createElement(
      "button",
      { "aria-label": ariaLabel, ...rest },
      children,
    ),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("span", { "data-icon": name }),
}));

describe("AddMenuPopover", () => {
  it("renders add group with file, cloud, site and merged mode items", () => {
    const hashPaletteRef = React.createRef<HTMLDivElement>();
    const html = renderToStaticMarkup(
      React.createElement(AddMenuPopover, {
        open: true,
        inputValue: "",
        hashPaletteRef: hashPaletteRef as React.RefObject<HTMLDivElement>,
        currentChatId: "chat-1",
        currentAgentKey: "agent-1",
        planningMode: false,
        canUsePlanningMode: true,
        editingMode: false,
        canUseEditingMode: false,
        onOpenFilePicker: jest.fn(),
        onAddReference: jest.fn(),
        onTogglePlanningMode: jest.fn(),
        onEditingModeChange: jest.fn(),
        children: React.createElement("div", null),
      }),
    );

    // Verify add group items are present
    expect(html).toContain("composer.addMenu.file");
    expect(html).toContain("composer.addMenu.cloud");

    // Site group is hidden when desktop bridge unavailable
    expect(html).not.toContain("composer.addMenu.group.site");

    // Mode item merged into add group (no separate mode group label)
    expect(html).not.toContain("composer.addMenu.group.mode");
    expect(html).toContain("composer.addMenu.mode.planning");

    // Chat group is present
    expect(html).toContain("composer.addMenu.group.chat");
  });
});

describe("AddMenuTrigger", () => {
  it("renders a plus button", () => {
    const html = renderToStaticMarkup(
      React.createElement(AddMenuTrigger, {
        disabled: false,
        loading: false,
        onClick: jest.fn(),
      }),
    );

    expect(html).toContain("composer.addMenu.open");
    expect(html).toContain("add");
  });
});

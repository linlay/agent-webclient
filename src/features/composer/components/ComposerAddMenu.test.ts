import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerAddMenu } from "@/features/composer/components/ComposerAddMenu";

jest.mock("antd", () => ({
  Dropdown: ({
    children,
    menu,
  }: {
    children: React.ReactNode;
    menu: { items?: Array<{ key?: React.Key; children?: Array<{ key?: React.Key }> }> };
  }) =>
    React.createElement(
      "div",
      null,
      children,
      menu.items?.flatMap((group) =>
        (group.children || []).map((item) =>
          React.createElement("span", {
            key: String(item.key),
            "data-menu-key": String(item.key),
          }),
        ),
      ),
    ),
  Empty: () => null,
  Input: Object.assign(() => null, { Search: () => null }),
  List: Object.assign(() => null, {
    Item: Object.assign(() => null, { Meta: () => null }),
  }),
  Modal: () => null,
  Radio: Object.assign(() => null, { Group: () => null }),
  Spin: () => null,
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("ComposerAddMenu", () => {
  it("keeps files, references, and modes but does not expose skills", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerAddMenu, {
        disabled: false,
        loading: false,
        currentChatId: "chat-1",
        planningMode: false,
        canUsePlanningMode: true,
        editingMode: false,
        canUseEditingMode: false,
        onOpenFilePicker: jest.fn(),
        onAddReference: jest.fn(),
        onTogglePlanningMode: jest.fn(),
        onEditingModeChange: jest.fn(),
      }),
    );

    expect(html).toContain('data-menu-key="add:file"');
    expect(html).toContain('data-menu-key="add:chat"');
    expect(html).toContain('data-menu-key="add:site"');
    expect(html).toContain('data-menu-key="mode:planning"');
    expect(html).not.toContain("skill:");
  });
});

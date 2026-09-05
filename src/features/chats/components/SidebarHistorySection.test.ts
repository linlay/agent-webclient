import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarHistorySection } from "@/features/chats/components/SidebarHistorySection";
import { I18nProvider } from "@/shared/i18n";

jest.mock("antd", () => ({
  Modal: ({ open, title, children }: any) =>
    open
      ? React.createElement(
          "section",
          { className: "history-modal", "data-has-title": title ? "true" : "false" },
          children,
        )
      : null,
}));

jest.mock("@/features/chats/components/HistoryModal", () => ({
  HistoryModal: () => React.createElement("div", { className: "history-list" }),
}));

describe("SidebarHistorySection", () => {
  it("renders the modal without a title and delegates content to HistoryModal", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(SidebarHistorySection, {
          open: true,
          onClose: jest.fn(),
          onSelectChat: jest.fn(),
        }),
      ),
    );

    expect(html).toContain('data-has-title="false"');
    expect(html).toContain("history-list");
  });
});

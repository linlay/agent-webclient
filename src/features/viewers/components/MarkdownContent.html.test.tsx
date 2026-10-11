/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "./MarkdownContent";

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => jest.fn(),
  useAppState: () => ({ rightSidebarOpen: false, rightSidebarOpenTab: null, activeViewerKey: "" }),
}));
jest.mock("antd", () => ({
  App: { useApp: () => ({ message: { success: jest.fn() } }) },
  Collapse: ({ activeKey, items }: any) => <div>{items.map((item: any) => <section key={item.key}>
    {item.label}{activeKey === item.key ? item.children : null}</section>)}</div>,
  Flex: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <>{children}</>,
}));

it("keeps complete HTML documents as source in reused viewers and opts in explicitly for the timeline", () => {
  const content = '```html\n<!doctype html><html><body><script>window.example=1</script></body></html>\n```';
  const render = (htmlPreview?: boolean) => renderToStaticMarkup(<MarkdownContent content={content} chatId="chat" htmlPreview={htmlPreview} />);
  expect(render()).not.toContain("data-html-preview");
  const source = document.createElement("div"); source.innerHTML = render(false);
  expect(source.textContent).toContain("window.example");
  expect(render(true)).toContain("data-html-preview");
});

/** @jest-environment jsdom */
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContentBlock } from "./ContentBlock";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";
import { MarkdownContent } from "@/features/viewers/components/MarkdownContent";

// Keep the parser out of the test, but reconcile the real custom anchor component.
// Changing components.a must remount it, just as the Markdown renderer does.
jest.mock("@ant-design/x-markdown", () => ({
  XMarkdown: ({ components, children }: any) => {
    const href = /\[link\]\((.*)\)/.exec(children)?.[1];
    return React.createElement(components.a, { href }, "link");
  },
}));
jest.mock("@/features/viewers/components/MarkdownCode", () => ({ MarkdownCode: () => null }));
jest.mock("@/shared/ui/markdown-code/ConversationMarkdownCode", () => ({ ConversationMarkdownCode: () => null }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/config/featureFlags", () => ({ isVoiceEnabled: () => false }));
jest.mock("@/shared/data/desktop/desktopContextMenu", () => ({ useDesktopContextMenuTarget: () => undefined }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const openTarget = jest.fn();
function FocusProbe({ href, open = openTarget, agentKey = "demo" }: { href: string; open?: typeof openTarget; agentKey?: string }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  // ConnectedConversationStage rebuilds this context on app state changes,
  // while useOpenTarget intentionally keeps the operation reference stable.
  return <TimelineInteractionProvider value={{
    conversationActive: revision > 0,
    surfaceContext: { chatId: "chat_01", agentKey },
    openTarget: open,
    renderMarkdown: props => <MarkdownContent {...props} />,
  }}>
    <ContentBlock node={{ id: "answer", kind: "content", role: "assistant", text: `[link](${href})`, ts: 1 }} />
  </TimelineInteractionProvider>;
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  openTarget.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it.each([
  ["https://example.com/report", { kind: "web", url: "https://example.com/report" }],
  ["/Users/demo/project/report.md", { kind: "file", agentKey: "demo", path: "/Users/demo/project/report.md" }],
  ["artifacts/run_01/report.html", { kind: "resource", chatId: "chat_01", file: "artifacts/run_01/report.html" }],
])("keeps %s mounted through focus and opens WorkPanel on the first click", async (href, intent) => {
  await act(async () => root.render(<FocusProbe href={String(href)} />));
  const anchor = container.querySelector("a")!;
  act(() => anchor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.querySelector("a")).toBe(anchor);
  await act(async () => anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
  expect(openTarget).toHaveBeenCalledTimes(1);
  expect(openTarget).toHaveBeenCalledWith(expect.objectContaining(intent as object));
});

it("uses the updated operation and Agent identity after a genuine context change", async () => {
  const href = "/Users/demo/project/report.md";
  await act(async () => root.render(<FocusProbe href={href} />));
  const nextOpen = jest.fn();
  await act(async () => root.render(<FocusProbe href={href} open={nextOpen} agentKey="next" />));
  await act(async () => container.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  expect(openTarget).not.toHaveBeenCalled();
  expect(nextOpen).toHaveBeenCalledWith(expect.objectContaining({ kind: "file", agentKey: "next" }));
});

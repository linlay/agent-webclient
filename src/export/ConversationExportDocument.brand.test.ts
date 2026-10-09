/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ConversationSnapshotV1 } from "./conversationSnapshotV1";
import { ConversationExportDocument } from "./ConversationExportDocument";

Object.assign(globalThis, { TextEncoder: require("util").TextEncoder });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");

jest.mock("./brand-icons/zenmind.svg", () => "zenmind-icon");
jest.mock("./brand-icons/cutej.svg", () => "cutej-icon");
jest.mock("@/shared/icons/agent-icons/default.svg", () => "default-icon");

jest.mock("./conversationSnapshotV1", () => ({ snapshotV1PreviewData: () => ({}) }));
jest.mock("@/shared/icons/agentIconAssets", () => ({
  getAgentIconSource: (name?: string) => name ? `icon-${name}` : "default-icon",
}));
jest.mock("@/features/conversation/components/ConversationPreview", () => {
  const ReactRuntime = require("react") as typeof React;
  return { ConversationPreview: ({ renderRunHeader, renderMarkdown }: {
    renderRunHeader: (run: { runId: string }) => React.ReactNode;
    renderMarkdown: (props: { content: string; chatId: string }) => React.ReactNode;
  }) =>
    ReactRuntime.createElement("section", null,
      renderRunHeader({ runId: "run-one" }), renderRunHeader({ runId: "run-two" }),
      renderMarkdown({ chatId: "", content: "[HTML](artifacts/run-1/page.html) [PDF](artifacts/run-1/report.pdf) [OLD](/api/resource?file=chat/artifacts/run-1/page.html) [NEW](<@chat/artifacts/run-1/报告 (1).pdf>) [MISSING](@chat/artifacts/run-1/absent.pdf)" })) };
});
jest.mock("@/shared/ui/markdown-code/ConversationMarkdownCode", () => ({ ConversationMarkdownCode: () => null }));

const snapshot: ConversationSnapshotV1 = {
  version: 1, title: "Shared conversation", locale: "zh-CN", createdAt: 1, capturedAt: 2,
  turns: [
    { runId: "run-one", queryAt: 1, startedAt: 1, outcome: "completed",
      assistant: { name: "小君", iconName: "terminal" }, nodes: [] },
    { runId: "run-two", queryAt: 2, startedAt: 2, outcome: "completed", nodes: [] },
  ],
  attachments: [],
};

it("uses each run's assistant identity and falls back for an older turn", () => {
  const html = renderToStaticMarkup(React.createElement(ConversationExportDocument, { snapshot }));
  expect(html).toContain('src="icon-terminal"');
  expect(html).toContain("小君");
  expect(html).toContain('src="default-icon"');
  expect(html).toContain("助手");
  expect(html).not.toContain("继续聊");
  expect(html).not.toContain("复制对话");
});

it("renders a dismissible app entry only when a public brand is supplied", () => {
  const html = renderToStaticMarkup(React.createElement(ConversationExportDocument, {
    snapshot, publicBrand: { id: "cutej", productName: "CuteJ", openUrl: "cutej://open" },
  }));
  expect(html).toContain('href="cutej://open"');
  expect(html).toContain("在 CuteJ 继续聊");
  expect(html).toContain("关闭应用入口");
});

it("previews HTML resources and offers other formal resources for download", () => {
  window.history.replaceState({}, "", "/share/share-1");
  const html = renderToStaticMarkup(React.createElement(ConversationExportDocument, {
    snapshot: {
      ...snapshot,
      attachments: [
        { id: "0123456789abcdef01234567", name: "page.html", mimeType: "text/html",
          size: 1, sha256: "a".repeat(64), sourceRef: "artifacts/run-1/page.html" },
        { id: "abcdef0123456789abcdef01", name: "report.pdf", mimeType: "application/pdf",
          size: 1, sha256: "b".repeat(64), sourceRef: "artifacts/run-1/report.pdf" },
      ],
    },
  }));
  expect(html).toContain("page.html");
  expect(html).toContain('href="/share/share-1/attachments/0123456789abcdef01234567/preview"');
  expect(html).toContain("report.pdf");
  expect(html).toContain('href="/share/share-1/attachments/abcdef0123456789abcdef01/download"');
  expect(html).toContain('>HTML</a>');
  expect(html).toContain('>PDF</a>');
  expect(html).toContain('>OLD</a>');
});

// The body names a published file as "@chat/<literal path>", while the snapshot
// keeps Platform's encoded bare sourceRef; both must resolve to the attachment.
it("links an @chat/ body reference to its published attachment", () => {
  window.history.replaceState({}, "", "/share/share-1");
  const html = renderToStaticMarkup(React.createElement(ConversationExportDocument, {
    snapshot: {
      ...snapshot,
      attachments: [
        { id: "fedcba9876543210fedcba98", name: "报告 (1).pdf", mimeType: "application/pdf",
          size: 1, sha256: "c".repeat(64), sourceRef: "artifacts/run-1/%E6%8A%A5%E5%91%8A%20%281%29.pdf" },
      ],
    },
  }));
  expect(html).toContain('href="/share/share-1/attachments/fedcba9876543210fedcba98/download">NEW</a>');
  // An unpublished reference stays plain text rather than a dead link.
  expect(html).toContain("<span>MISSING</span>");
});

it("opens a legacy Markdown HTML link directly without a HEAD request", () => {
  window.history.replaceState({}, "", "/share/share-1");
  const host = document.createElement("div");
  const root = createRoot(host);
  const previousFetch = globalThis.fetch;
  const fetchSpy = jest.fn();
  globalThis.fetch = fetchSpy as typeof fetch;
  const page = { ...snapshot, attachments: [{
    id: "0123456789abcdef01234567", name: "page.html", mimeType: "text/html",
    sourceRef: "artifacts/run-1/page.html",
  }] };
  try {
    act(() => root.render(React.createElement(ConversationExportDocument, { snapshot: page })));
    const link = Array.from(host.querySelectorAll("a")).find((item) => item.textContent === "OLD");
    expect(link).toBeDefined();
    act(() => link!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(host.querySelector("iframe")?.getAttribute("src"))
      .toBe("/share/share-1/attachments/0123456789abcdef01234567/preview");
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    globalThis.fetch = previousFetch;
  }
});

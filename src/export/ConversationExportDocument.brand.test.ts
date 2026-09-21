/** @jest-environment jsdom */

import React from "react";
import type { ConversationSnapshotV1 } from "./conversationSnapshotV1";
import { ConversationExportDocument } from "./ConversationExportDocument";

Object.assign(globalThis, { TextEncoder: require("util").TextEncoder });
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
  return { ConversationPreview: ({ renderRunHeader }: { renderRunHeader: (run: { runId: string }) => React.ReactNode }) =>
    ReactRuntime.createElement("section", null,
      renderRunHeader({ runId: "run-one" }), renderRunHeader({ runId: "run-two" })) };
});
jest.mock("@/shared/ui/ConversationMarkdown", () => ({ ConversationMarkdown: () => null }));
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

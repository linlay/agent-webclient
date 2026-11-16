import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchiveDetailPane } from "@/features/archive/components/ArchiveDetailPane";

jest.mock("antd", () => ({ Spin: () => null }));

jest.mock("@/features/surfaces/hooks/useOpenTarget", () => ({
  useOpenTarget: () => jest.fn(),
}));

jest.mock("@/shared/ui/useAppMessage", () => ({
  useAppMessage: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock("@/features/conversation/components/ConversationPreview", () => ({
  ConversationPreview: ({ data, emptyLabel }: {
    data: { nodes: Array<{ kind: string }> };
    emptyLabel?: string;
  }) => (
    <div data-testid="conversation-preview">
      {emptyLabel}
      {data.nodes.map((node, index) => `${node.kind}:${index}`).join(" ")}
    </div>
  ),
}));

const baseProps = {
  selectedChatId: "chat_1",
  detail: { chatId: "chat_1", events: [] },
  loading: false,
  usageSummary: "",
  agents: [],
};

const render = (overrides: Partial<React.ComponentProps<typeof ArchiveDetailPane>>) =>
  renderToStaticMarkup(React.createElement(ArchiveDetailPane, { ...baseProps, ...overrides }));

test("renders the replayed conversation without a raw event surface", () => {
  const markup = render({
    conversation: {
      chatId: "chat_1",
      nodes: [{ kind: "message" }, { kind: "content" }] as never,
      terminals: [],
      tasks: new Map(),
    },
  });

  expect(markup).toContain("message:0 content:1");
  expect(markup).not.toContain("原始事件");
});

test("shows the empty state when nothing is previewable", () => {
  const markup = render({ conversation: null });

  expect(markup).toContain("该归档暂无可预览内容。");
  expect(markup).not.toContain("conversation-preview");
});

test("keeps the empty area blank while the detail is still loading", () => {
  const markup = render({ conversation: null, loading: true });

  expect(markup).toContain('aria-busy="true"');
  expect(markup).not.toContain("该归档暂无可预览内容。");
});

test("archive detail shows a brief warning only for an unavailable artifact manifest", () => {
  const normal = render({ conversation: null });
  const damaged = render({
    conversation: null,
    detail: { chatId: "chat_1", events: [], artifactManifestUnavailable: true },
  });

  expect(normal).toContain("该归档暂无可预览内容。");
  expect(normal).not.toContain('role="note"');
  expect(damaged).toContain('role="note"');
});
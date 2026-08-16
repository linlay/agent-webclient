import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/shared/ui/ConversationMarkdown", () => ({
  ConversationMarkdown: ({ content }: { content: string }) =>
    React.createElement("div", null, content),
}));

import type { SharedConversationTurn } from "@/shared/data/conversationShare";
import {
  formatSharedDuration,
  SharedConversationTranscript,
} from "./SharedConversationTranscript";

const STARTED_AT = 1_700_000_000_000;

describe("SharedConversationTranscript", () => {
  it("renders each authoritative turn without reconstructing groups", () => {
    const turns: SharedConversationTurn[] = [
      {
        startedAt: STARTED_AT,
        completedAt: STARTED_AT + 174_000,
        items: [
          { kind: "user-message", content: "question", createdAt: STARTED_AT },
          { kind: "assistant-reasoning", content: "hidden first", createdAt: STARTED_AT + 1 },
          { kind: "assistant-message", content: "hidden progress", createdAt: STARTED_AT + 2 },
          { kind: "assistant-reasoning", content: "hidden second", label: "深度思考", createdAt: STARTED_AT + 3 },
          { kind: "assistant-message", content: "visible answer", createdAt: STARTED_AT + 4 },
        ],
      },
      {
        startedAt: STARTED_AT + 200_000,
        items: [
          { kind: "user-message", content: "follow-up", createdAt: STARTED_AT + 200_000 },
          { kind: "assistant-message", content: "plain answer", createdAt: STARTED_AT + 200_001 },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(SharedConversationTranscript, { turns }),
    );

    expect(html.match(/aria-expanded="false"/gu)).toHaveLength(1);
    expect(html).toContain("已完成 2m54s");
    expect(html).toContain("question");
    expect(html).toContain("visible answer");
    expect(html).toContain("follow-up");
    expect(html).toContain("plain answer");
    expect(html).not.toContain("hidden first");
    expect(html).not.toContain("hidden progress");
    expect(html).not.toContain("hidden second");
  });

  it("keeps all process items collapsed when a turn has no final assistant message", () => {
    const html = renderToStaticMarkup(
      React.createElement(SharedConversationTranscript, {
        turns: [{
          startedAt: STARTED_AT,
          items: [
            { kind: "user-message", content: "question", createdAt: STARTED_AT },
            { kind: "assistant-message", content: "hidden progress", createdAt: STARTED_AT + 1 },
            { kind: "assistant-reasoning", content: "still thinking", createdAt: STARTED_AT + 2 },
          ],
        }],
      }),
    );

    expect(html).toContain(">已完成<");
    expect(html).not.toContain("hidden progress");
    expect(html).not.toContain("still thinking");
  });

  it("formats the authoritative completion duration compactly", () => {
    expect(formatSharedDuration(850)).toBe("850ms");
    expect(formatSharedDuration(54_000)).toBe("54s");
    expect(formatSharedDuration(174_000)).toBe("2m54s");
    expect(formatSharedDuration(7_260_000)).toBe("2h1m");
    expect(formatSharedDuration(-1)).toBe("");
  });
});

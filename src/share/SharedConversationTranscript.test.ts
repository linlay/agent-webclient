import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/shared/ui/ConversationMarkdown", () => ({
  ConversationMarkdown: ({ content }: { content: string }) =>
    React.createElement("div", null, content),
}));

import {
  formatSharedDuration,
  groupTranscriptEntries,
} from "./shareTranscriptGroups";
import type { SharedConversationEntry } from "@/shared/data/conversationShare";
import { SharedConversationTranscript } from "./SharedConversationTranscript";

describe("SharedConversationTranscript", () => {
  it("preserves interleaved reasoning and process messages in one assistant turn", () => {
    const entries: SharedConversationEntry[] = [
      { type: "message", role: "user", content: "question" },
      { type: "reasoning", content: "first", durationMs: 1_000 },
      { type: "message", role: "assistant", content: "progress" },
      { type: "reasoning", content: "second", label: "深度思考", durationMs: 2_000 },
      { type: "message", role: "assistant", content: "answer" },
      { type: "message", role: "user", content: "follow-up" },
    ];

    const groups = groupTranscriptEntries(entries);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ type: "user" });
    expect(groups[1]).toMatchObject({
      type: "assistant",
      traceEntries: [
        expect.objectContaining({ type: "reasoning", content: "first" }),
        expect.objectContaining({ type: "message", content: "progress" }),
        expect.objectContaining({ type: "reasoning", content: "second" }),
      ],
      responseEntries: [
        expect.objectContaining({ type: "message", content: "answer" }),
      ],
      durationMs: 2_000,
    });
    expect(groups[2]).toMatchObject({ type: "user" });
  });

  it("creates one reasoning group per reply and leaves plain replies untouched", () => {
    const groups = groupTranscriptEntries([
      { type: "message", role: "user", content: "first question" },
      { type: "reasoning", content: "first reasoning" },
      { type: "message", role: "assistant", content: "first answer" },
      { type: "message", role: "user", content: "second question" },
      { type: "message", role: "assistant", content: "second answer" },
    ]);

    expect(groups).toHaveLength(4);
    expect(groups[1]).toMatchObject({
      type: "assistant",
      traceEntries: [{ content: "first reasoning" }],
      responseEntries: [{ content: "first answer" }],
    });
    expect(groups[3]).toMatchObject({
      type: "assistant",
      traceEntries: [],
      responseEntries: [{ content: "second answer" }],
    });
  });

  it("keeps all entries in the trace when a reply has no final assistant message", () => {
    const groups = groupTranscriptEntries([
      { type: "message", role: "user", content: "question" },
      { type: "message", role: "assistant", content: "progress" },
      { type: "reasoning", content: "still thinking", durationMs: 500 },
    ]);

    expect(groups[1]).toMatchObject({
      type: "assistant",
      traceEntries: [
        { type: "message", content: "progress" },
        { type: "reasoning", content: "still thinking" },
      ],
      responseEntries: [],
    });
  });

  it("renders one collapsed completion control for repeated reasoning durations", () => {
    const html = renderToStaticMarkup(
      React.createElement(SharedConversationTranscript, {
        entries: [
          { type: "message", role: "user", content: "question" },
          { type: "reasoning", content: "hidden first", durationMs: 174_000 },
          { type: "message", role: "assistant", content: "hidden progress" },
          { type: "reasoning", content: "hidden second", durationMs: 174_000 },
          { type: "message", role: "assistant", content: "visible answer" },
        ],
      }),
    );

    expect(html.match(/aria-expanded="false"/gu)).toHaveLength(1);
    expect(html).toContain("已完成 2m54s");
    expect(html).toContain("visible answer");
    expect(html).not.toContain("hidden first");
    expect(html).not.toContain("hidden progress");
    expect(html).not.toContain("hidden second");
  });

  it("falls back to a completed label when the duration is absent", () => {
    const html = renderToStaticMarkup(
      React.createElement(SharedConversationTranscript, {
        entries: [
          { type: "reasoning", content: "hidden reasoning", label: "深度思考" },
          { type: "message", role: "assistant", content: "visible answer" },
        ],
      }),
    );

    expect(html).toContain(">已完成<");
    expect(html).not.toContain("思考过程");
  });

  it("formats the authoritative completion duration compactly", () => {
    expect(formatSharedDuration(850)).toBe("850ms");
    expect(formatSharedDuration(54_000)).toBe("54s");
    expect(formatSharedDuration(174_000)).toBe("2m54s");
    expect(formatSharedDuration(7_260_000)).toBe("2h1m");
    expect(formatSharedDuration(-1)).toBe("");
  });
});

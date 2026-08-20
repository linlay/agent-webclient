import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildConversationCopyText } from "./conversationCopyText";
import { ConversationExportDocument } from "./ConversationExportDocument";
import type { ConversationSnapshotV1 } from "./conversationSnapshot";

jest.mock("./ConversationExportDocument.module.css", () => ({
  finalResponse: "final-response",
  markdown: "markdown",
}));
jest.mock("@ant-design/x-markdown/plugins/Latex", () => ({
  __esModule: true,
  default: () => [],
}));

const snapshot: ConversationSnapshotV1 = {
  version: 1,
  title: "Release plan",
  createdAt: 1_700_000_000_000,
  capturedAt: 1_700_000_001_000,
  turns: [
    {
      startedAt: 1_700_000_000_100,
      endedAt: 1_700_000_000_900,
      outcome: "completed",
      items: [
        { kind: "user", text: "Ship it", at: 1_700_000_000_100 },
        {
          kind: "reasoning",
          text: "Check release gates",
          label: "验证",
          at: 1_700_000_000_500,
        },
        { kind: "assistant", text: "Ready", at: 1_700_000_000_800 },
      ],
    },
  ],
};

describe("ConversationExportDocument", () => {
  it("builds role-delimited copy text", () => {
    expect(buildConversationCopyText(snapshot, "zh-CN")).toBe(
      [
        "用户\n\nShip it",
        "验证\n\nCheck release gates",
        "助手\n\nReady",
      ].join("\n\n---\n\n"),
    );
  });

  it("falls back to the localized reasoning label", () => {
    const withoutLabel: ConversationSnapshotV1 = {
      ...snapshot,
      turns: [
        {
          ...snapshot.turns[0],
          items: snapshot.turns[0].items.map((item) =>
            item.kind === "reasoning" ? { ...item, label: undefined } : item,
          ) as ConversationSnapshotV1["turns"][number]["items"],
        },
      ],
    };
    expect(buildConversationCopyText(withoutLabel, "en-US")).toContain(
      "Reasoning\n\nCheck release gates",
    );
  });

  it("marks only a reasoning turn final response for the lead paragraph divider", () => {
    const html = renderDocument("先说结论。\n\n# 正式内容", true);

    expect(html).toContain("final-response");
    expect(renderDocument("先说结论。\n\n后续正文", false)).not.toContain(
      "final-response",
    );
  });

  it("keeps the divider on a non-terminal lead paragraph without depending on headings", () => {
    const css = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/export/ConversationExportDocument.module.css",
      ),
      "utf8",
    );

    expect(css).toMatch(
      /\.finalResponse\s*>\s*:global\(p:first-child:not\(:last-child\)\)\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--export-border\);/u,
    );
    expect(css).not.toMatch(
      /\.finalResponse\s*\{[^}]*border-top:/u,
    );
  });
});

function renderDocument(
  answer: string,
  includeReasoning: boolean,
): string {
  const value: ConversationSnapshotV1 = {
    ...snapshot,
    turns: [
      {
        ...snapshot.turns[0],
        items: [
          snapshot.turns[0].items[0],
          ...(includeReasoning
            ? [snapshot.turns[0].items[1]]
            : []),
          { kind: "assistant", text: answer, at: 1_700_000_000_800 },
        ],
      },
    ],
  };
  return renderToStaticMarkup(
    React.createElement(ConversationExportDocument, {
      locale: "zh-CN",
      snapshot: value,
    }),
  );
}

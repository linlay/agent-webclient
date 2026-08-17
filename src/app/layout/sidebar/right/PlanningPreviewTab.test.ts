import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanningPreviewContent } from "@/app/layout/sidebar/right/PlanningPreviewTab";

jest.mock("@/shared/ui/MarkdownContent", () => ({
  MarkdownContent: ({
    content,
    chatId,
    teamChat,
  }: {
    content: string;
    chatId: string;
    teamChat?: boolean;
  }) => React.createElement("article", {
    "data-chat-id": chatId,
    "data-team-chat": String(Boolean(teamChat)),
  }, content),
}));

describe("PlanningPreviewContent", () => {
  it("renders Markdown with the injected route ChatScope", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanningPreviewContent, {
        node: {
          id: "planning_node_1",
          kind: "planning",
          planningId: "planning_1",
          text: "Plan body",
          ts: 1_710_000_000_000,
        },
        chatId: "chat_route_1",
        teamChat: true,
      }),
    );

    expect(html).toContain('data-chat-id="chat_route_1"');
    expect(html).toContain('data-team-chat="true"');
    expect(html).toContain("Plan body");
  });
});

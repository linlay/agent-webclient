import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { ContentBlock } from "./ContentBlock";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";
import type { MarkdownContentProps } from "@/features/viewers/components/MarkdownContent";

const openTarget = jest.fn();
const markdownProps: MarkdownContentProps[] = [];

function renderNode(node: TimelineNode, surface = { chatId: "chat_01", agentKey: "coder-agent", teamChat: false }) {
  markdownProps.length = 0;
  openTarget.mockClear();
  return renderToStaticMarkup(React.createElement(TimelineInteractionProvider, {
    value: {
      readOnly: true,
      surfaceContext: surface,
      openTarget,
      renderMarkdown: (props) => {
        markdownProps.push(props);
        return React.createElement("div", { className: "x-markdown" }, props.content);
      },
    },
  }, React.createElement(ContentBlock, { node })));
}

function content(text: string): TimelineNode {
  return { id: "content-1", kind: "content", role: "assistant", text, ts: 100 };
}

describe("ContentBlock presentation boundary", () => {
  it("passes the selected chat and content to the host Markdown renderer", () => {
    const html = renderNode(content("> 第一段\n>\n> 第二段"), {
      chatId: "history", agentKey: "agent-1", teamChat: true,
    });
    expect(markdownProps[0]).toMatchObject({ chatId: "history", teamChat: true, content: "> 第一段\n>\n> 第二段" });
    expect(html).toContain("timeline-markdown");
    expect(html).toContain("tw:whitespace-normal");
  });

  it("routes workspace links through the host instead of the application store", () => {
    renderNode(content("[a.ts](/Users/demo/project/src/a.ts:12)"));
    markdownProps[0].onWorkspaceFileLinkClick?.({
      href: "/Users/demo/project/src/a.ts:12", filePath: "/Users/demo/project/src/a.ts", line: 12,
    });
    expect(openTarget).toHaveBeenCalledWith(expect.objectContaining({
      version: 1, kind: "file", agentKey: "coder-agent", path: "/Users/demo/project/src/a.ts", line: 12,
    }));
  });

  it("routes ChatScope resources through the host with the selected chat", () => {
    const href = "artifacts/run/report.html";
    renderNode(content(`[report](${href})`));
    markdownProps[0].onResourceFileLinkClick?.({ href, name: "report.html",
      classification: { kind: "chat", source: href, fetchUrl: "/api/resource?file=chat_01", requiresPlatformAuth: true },
    });
    expect(openTarget).toHaveBeenCalledWith(expect.objectContaining({
      version: 1, kind: "resource", chatId: "chat_01", file: href, title: "report.html",
    }));
  });

  it("routes web links through the host", () => {
    renderNode(content("[site](https://example.com)"));
    markdownProps[0].onWebLinkClick?.({ href: "https://example.com", url: "https://example.com/", title: "Site" });
    expect(openTarget).toHaveBeenCalledWith({ version: 1, kind: "web", url: "https://example.com/", title: "Site" });
  });

  it("retains voice text in read-only history without voice controls", () => {
    const html = renderNode({ id: "voice", kind: "content", text: "", segments: [
      { kind: "ttsVoice", signature: "voice-1", text: "Spoken answer", closed: true },
    ] });
    expect(html).toContain("Spoken answer");
    expect(html).not.toContain("button");
  });
});

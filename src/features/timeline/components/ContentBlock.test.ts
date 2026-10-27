import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { ContentBlock } from "./ContentBlock";
import { parseContentSegments } from "@/features/events/lib/contentSegments";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";
import type { MarkdownContentProps } from "@/features/viewers/components/MarkdownContent";

const openTarget = jest.fn();
const markdownProps: MarkdownContentProps[] = [];

function renderNode(node: TimelineNode, surface = { chatId: "chat_01", agentKey: "coder-agent", teamChat: false }, conversationActive = false) {
  markdownProps.length = 0;
  openTarget.mockClear();
  return renderToStaticMarkup(React.createElement(TimelineInteractionProvider, {
    value: {
      readOnly: true,
      conversationActive,
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
  it("marks only live unfinished content as receiving", () => {
    renderNode(content("partial HTML"), undefined, true);
    expect(markdownProps[0].isStreaming).toBe(true);
    renderNode({ ...content("partial HTML"), status: "completed" }, undefined, true);
    expect(markdownProps[0].isStreaming).toBe(false);
    renderNode(content("partial HTML"));
    expect(markdownProps[0].isStreaming).toBe(false);
  });
  it("passes the selected chat and content to the host Markdown renderer", () => {
    const html = renderNode(content("> 第一段\n>\n> 第二段"), {
      chatId: "history", agentKey: "agent-1", teamChat: true,
    });
    expect(markdownProps[0]).toMatchObject({ chatId: "history", agentKey: "agent-1", teamChat: true, content: "> 第一段\n>\n> 第二段" });
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

describe("ContentBlock Markdown VIEW blocks", () => {
  const raw = "```view key=crm/orders\n{\"items\":[]}\n```";
  const hash = "a".repeat(64);
  function renderView(node: TimelineNode, conversationActive: boolean) {
    const rendered: unknown[] = [];
    const html = renderToStaticMarkup(React.createElement(TimelineInteractionProvider, {
      value: {
        conversationActive,
        renderMarkdown: (props) => React.createElement("div", { className: "x-markdown" }, props.content),
        renderContentView: (segment, _chatId, binding) => {
          rendered.push({ payloadRaw: segment.payloadRaw, binding });
          return React.createElement("div", { className: "x-view" });
        },
      },
    }, React.createElement(ContentBlock, { node })));
    return { html, rendered };
  }
  function viewNode(extra: Partial<TimelineNode>): TimelineNode {
    return { ...content(raw), contentId: "c1", segments: parseContentSegments("c1", raw), ...extra };
  }

  it("renders a bound block with its frozen view and data", () => {
    const binding = { index: 0, view: { source: "connector" as const, connectorId: "crm", key: "orders", hash } };
    const { html, rendered } = renderView(viewNode({ viewBindings: { 0: binding }, status: "completed" }), false);
    expect(html).toContain("x-view");
    expect(rendered).toEqual([{ payloadRaw: '{"items":[]}', binding }]);
  });

  it("waits for the binding while the content streams", () => {
    const { html, rendered } = renderView(viewNode({}), true);
    expect(html).toContain('role="status"');
    expect(rendered).toEqual([]);
  });

  it("falls back to the raw block when settled without a binding", () => {
    const { html, rendered } = renderView(viewNode({ status: "completed" }), false);
    expect(html).toContain("x-markdown");
    expect(html).toContain("```view key=crm/orders");
    expect(rendered).toEqual([]);
  });
});

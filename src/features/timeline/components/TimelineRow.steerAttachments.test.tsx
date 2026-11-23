import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineRow } from "./TimelineRow";
import {
  TimelineInteractionProvider,
  type TimelineInteractionValue,
} from "./TimelineInteractionContext";
import type { TimelineNode } from "../lib/timelineState";

/** 引导行只有引用没有正文时的排版：不渲染空气泡，图标排到附件左边。 */
const IMAGE = {
  id: "img",
  type: "file",
  name: "image.png",
  url: "image.png",
  mimeType: "image/png",
};
const DOC = {
  id: "doc",
  type: "file",
  name: "大屏需求.docx",
  url: "demand.docx",
};

function steerNode(node: Partial<TimelineNode> = {}): TimelineNode {
  return {
    id: "steer_1",
    kind: "message",
    role: "user",
    messageVariant: "steer",
    ts: 1,
    ...node,
  } as TimelineNode;
}

function render(
  node: TimelineNode,
  value: Partial<TimelineInteractionValue> = {},
): string {
  return renderToStaticMarkup(
    <TimelineInteractionProvider value={value}>
      <TimelineRow node={node} />
    </TimelineInteractionProvider>,
  );
}

type AttachmentOptions = Parameters<
  NonNullable<TimelineInteractionValue["renderAttachment"]>
>[1];

function recordAttachment(options: AttachmentOptions[]) {
  const renderAttachment: NonNullable<
    TimelineInteractionValue["renderAttachment"]
  > = (attachment, next) => {
    options.push(next);
    return <span data-attachment={attachment.name} />;
  };
  return renderAttachment;
}

const attachmentIndex = (html: string) =>
  html.indexOf('data-attachment="image.png"');

describe("TimelineRow steer attachments", () => {
  it("renders no bubble when a steer has no text", () => {
    const html = render(steerNode({ text: "", attachments: [IMAGE] }), {
      detailLevel: "detailed",
      renderAttachment: recordAttachment([]),
    });
    expect(html).toContain('data-attachment="image.png"');
    expect(html).not.toContain("timeline-user-bubble");
  });

  it("renders no bubble for whitespace-only text", () => {
    const html = render(steerNode({ text: "   ", attachments: [IMAGE] }), {
      detailLevel: "detailed",
      renderAttachment: recordAttachment([]),
    });
    expect(html).not.toContain("timeline-user-bubble");
  });

  it("puts the steer icon left of the attachments when there is no text", () => {
    const html = render(steerNode({ text: "", attachments: [IMAGE] }), {
      detailLevel: "simple",
      renderAttachment: recordAttachment([]),
    });
    const icon = html.indexOf("timeline-inline-icon");
    expect(icon).toBeGreaterThanOrEqual(0);
    expect(attachmentIndex(html)).toBeGreaterThan(icon);
  });

  it("keeps attachments above the icon and bubble line when the steer has text", () => {
    const html = render(steerNode({ text: "看这张图", attachments: [IMAGE] }), {
      detailLevel: "simple",
      renderAttachment: recordAttachment([]),
    });
    expect(html).toContain("timeline-user-bubble");
    const inlineRow = html.indexOf("timeline-inline-row");
    expect(inlineRow).toBeGreaterThanOrEqual(0);
    expect(attachmentIndex(html)).toBeLessThan(inlineRow);
  });

  it("turns images into file cards when a steer carries several attachments", () => {
    const options: AttachmentOptions[] = [];
    render(steerNode({ text: "两个文件", attachments: [IMAGE, DOC] }), {
      detailLevel: "detailed",
      renderAttachment: recordAttachment(options),
    });
    expect(options).toHaveLength(2);
    expect(options.every(option => option.displayMode === "file")).toBe(true);
    expect(options.every(option => Boolean(option.subtitle))).toBe(true);
  });

  it("keeps a lone image on its inline presentation", () => {
    const options: AttachmentOptions[] = [];
    render(steerNode({ text: "看这张图", attachments: [IMAGE] }), {
      detailLevel: "detailed",
      renderAttachment: recordAttachment(options),
    });
    expect(options).toEqual([{}]);
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockUseAuthenticatedResourceUrl = jest.fn();

jest.mock("@ant-design/x-markdown", () => ({
  XMarkdown: ({ components }: { components: Record<string, React.ComponentType<any>> }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(components.img, {
        src: "image.png",
        alt: "preview",
        class: "renderer-class",
        classname: "renderer-classname",
        className: "safe-image",
        children: [],
        dangerouslySetInnerHTML: { __html: "unsafe" },
        domNode: { name: "img" },
        streamStatus: "done",
      }),
      React.createElement(components.img, {
        src: "artifacts/run_01/demo.mp4",
        alt: "video preview",
        title: "demo video",
        children: [],
        dangerouslySetInnerHTML: { __html: "unsafe" },
        domNode: { name: "img" },
        streamStatus: "done",
      }),
      React.createElement(
        components.a,
        { href: "artifacts/run_01/image.png" },
        "download",
      ),
      React.createElement(
        components.a,
        { href: "/api/resource?file=chat_01%2Fold.png", "data-kind": "legacy" },
        "legacy",
      ),
      React.createElement(
        components.a,
        { href: "/Users/alice/project/poster.png", "data-kind": "absolute" },
        "workspace",
      ),
    ),
}));

jest.mock("@ant-design/x-markdown/plugins/Latex", () => () => []);

jest.mock("@/shared/ui/useAuthenticatedResourceUrl", () => ({
  useAuthenticatedResourceUrl: (...args: unknown[]) =>
    mockUseAuthenticatedResourceUrl(...args),
}));

import { MarkdownContent } from "@/shared/ui/MarkdownContent";

describe("MarkdownContent resource image", () => {
  beforeEach(() => {
    mockUseAuthenticatedResourceUrl.mockReset();
    mockUseAuthenticatedResourceUrl.mockReturnValue({
      url: "blob:authenticated-preview",
      loading: false,
      error: null,
    });
  });

  it("renders the authenticated Blob URL without void-element renderer props", () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        content: "![preview](image.png)",
        chatId: "chat_01",
      }),
    );

    expect(mockUseAuthenticatedResourceUrl).toHaveBeenCalledWith(
      "image.png",
      "chat_01",
      { teamChat: false },
    );
    expect(mockUseAuthenticatedResourceUrl).toHaveBeenCalledWith(
      "artifacts/run_01/demo.mp4",
      "chat_01",
      { teamChat: false, blobMimeTypeFallback: "video/mp4" },
    );
    expect(html).toContain('src="blob:authenticated-preview"');
    expect(html).toContain('<video');
    expect(html).toContain('class="markdown-video"');
    expect(html).toContain('controls=""');
    expect(html).toContain('aria-label="video preview"');
    expect(html).toContain('title="demo video"');
    expect(html).toContain(
      'href="artifacts/run_01/image.png"',
    );
    expect(html).not.toContain('download="image.png"');
    expect(html).toContain('data-kind="legacy"');
    expect(html).not.toContain('href="/api/resource');
    expect(html).toContain('href="/Users/alice/project/poster.png"');
    expect(html).toContain('class="safe-image"');
    expect(html).not.toContain("children");
    expect(html).not.toContain("domNode");
    expect(html).not.toContain("streamStatus");
    expect(html).not.toContain("dangerouslySetInnerHTML");
    expect(html).not.toContain("renderer-class");
  });

  it("keeps absolute Markdown resources clickable so Platform decides Team access", () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        content: "[workspace](/Users/alice/project/poster.png)",
        chatId: "chat_01",
        teamChat: true,
      }),
    );

    expect(html).toContain('data-kind="absolute"');
    expect(html).toContain('href="/Users/alice/project/poster.png"');
  });
});

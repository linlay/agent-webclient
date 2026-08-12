import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "@ant-design/x-markdown";
import { ConversationMarkdown } from "./ConversationMarkdown";

jest.mock("./ConversationMarkdown.module.css", () => ({ root: "markdown-root" }));
jest.mock("@ant-design/x-markdown/lib/XMarkdown/core", () => {
  const actual = jest.requireActual<{ Parser: unknown; Renderer: unknown }>(
    "@ant-design/x-markdown/lib/XMarkdown/core",
  );
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");

  type RendererOptions = {
    components?: Record<string, React.ComponentType<ComponentProps>>;
    dompurifyConfig?: { FORBID_TAGS?: string[] };
  };

  class TestRenderer {
    private readonly options: RendererOptions;

    constructor(options: RendererOptions) {
      this.options = options;
    }

    render(html: string): React.ReactElement {
      const codeMatch = html.match(/<code([^>]*)>([\s\S]*?)<\/code>/u);
      const Code = this.options.components?.code;
      if (codeMatch && Code) {
        const attributes = codeMatch[1] || "";
        const language = attributes.match(/data-lang="([^"]+)"/u)?.[1];
        const content = (codeMatch[2] || "")
          .replace(/&quot;/gu, '"')
          .replace(/&gt;/gu, ">")
          .replace(/&lt;/gu, "<")
          .replace(/&amp;/gu, "&");
        return ReactRuntime.createElement(Code, {
          block: attributes.includes('data-block="true"'),
          lang: language,
          children: content,
        });
      }

      return ReactRuntime.createElement("span", {
        "data-rendered-html": html,
        "data-forbidden-tags": this.options.dompurifyConfig?.FORBID_TAGS?.join(","),
      });
    }
  }

  return { ...actual, Renderer: TestRenderer };
});
jest.mock("@ant-design/x-markdown/plugins/Latex", () => ({
  __esModule: true,
  default: () => [],
}));

const TestCode: React.FC<ComponentProps> = ({ block, children, lang }) =>
  React.createElement(
    "code",
    {
      "data-block": block ? "true" : "false",
      "data-language": lang || "",
    },
    children,
  );

describe("ConversationMarkdown", () => {
  it("routes echarts fences through the injected code renderer", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConversationMarkdown, {
        content: [
          "```echarts",
          '{"series":[{"type":"bar","data":[1,2]}]}',
          "```",
        ].join("\n"),
        codeComponent: TestCode,
      }),
    );

    expect(html).toContain('data-block="true"');
    expect(html).toContain('data-language="echarts"');
    expect(html).toContain('&quot;series&quot;');
  });

  it("routes Mermaid fences through the injected code renderer", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConversationMarkdown, {
        content: "```mermaid\nflowchart LR\nA --> B\n```",
        codeComponent: TestCode,
      }),
    );

    expect(html).toContain('data-block="true"');
    expect(html).toContain('data-language="mermaid"');
    expect(html).toContain("flowchart LR");
  });

  it("escapes raw HTML and passes forbidden tags to the sanitizer", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConversationMarkdown, {
        content: [
          "<script>globalThis.compromised = true</script>",
          '<img src="x" onerror="globalThis.compromised = true">',
        ].join("\n\n"),
        codeComponent: TestCode,
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&amp;lt;script&amp;gt;");
    expect(html).toContain("script");
    expect(html).toContain("iframe");
  });
});

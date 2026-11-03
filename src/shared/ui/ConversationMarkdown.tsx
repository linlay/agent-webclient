import React, { useEffect, useMemo, useState } from "react";
import {
  XMarkdown as Markdown,
  type ComponentProps,
  type XMarkdownProps,
} from "@ant-design/x-markdown";
import { removeEmptyMarkdownTables } from "./markdownPreprocess";
import { useI18n } from "@/shared/i18n";
import styles from "./ConversationMarkdown.module.css";
import { MarkdownStreamingContext } from "./MarkdownStreamingContext";
import { markdownLocalMediaExtension } from "./markdownMedia";
import { isLiteralFileTarget } from "@/shared/utils/fileAddress";

type MarkdownComponents = NonNullable<XMarkdownProps["components"]>;

type LatexExtensions = ReturnType<
  (typeof import("@ant-design/x-markdown/plugins/Latex"))["default"]
>;

let latexExtensionsPromise: Promise<LatexExtensions> | null = null;

function loadLatexExtensions(): Promise<LatexExtensions> {
  if (!latexExtensionsPromise) {
    latexExtensionsPromise = import("@ant-design/x-markdown/plugins/Latex").then(
      (mod) => mod.default(),
    ).catch((error) => { latexExtensionsPromise = null; throw error; });
  }
  return latexExtensionsPromise;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type LiteralLinkToken = { href: string; title?: string | null; tokens?: unknown[]; text?: string };
type LiteralRendererThis = {
  parser: {
    parseInline(tokens: unknown[], renderer?: unknown): string;
    textRenderer: unknown;
  };
};

/**
 * File targets keep the exact path the author wrote. marked URL-encodes link
 * destinations, and decoding that again cannot tell a literal "%20" in a file
 * name from an encoded space, so only the HTML attribute is escaped here.
 * Web and other links keep marked's default rendering.
 */
const literalFileTargetRenderer = {
  link(this: LiteralRendererThis, token: LiteralLinkToken): string | false {
    if (!isLiteralFileTarget(token.href)) return false;
    const text = this.parser.parseInline(token.tokens || []);
    const title = token.title ? ` title="${escapeHtmlAttribute(token.title)}"` : "";
    return `<a href="${escapeHtmlAttribute(token.href)}"${title}>${text}</a>`;
  },
  image(this: LiteralRendererThis, token: LiteralLinkToken): string | false {
    if (!isLiteralFileTarget(token.href)) return false;
    const alt = escapeHtmlAttribute(token.tokens
      ? this.parser.parseInline(token.tokens, this.parser.textRenderer)
      : token.text || "");
    const title = token.title ? ` title="${escapeHtmlAttribute(token.title)}"` : "";
    return `<img src="${escapeHtmlAttribute(token.href)}" alt="${alt}"${title}>`;
  },
};

const MATH_PATTERN =
  /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^\s$][^$\n]*?\$/;

export type ConversationMarkdownElementProps<
  T extends Record<string, unknown> = Record<string, unknown>,
> = ComponentProps<T>;

export type ConversationMarkdownComponents = Partial<
  Pick<MarkdownComponents, "a" | "img">
>;

export type ConversationMarkdownProps = {
  content: string;
  className?: string;
  components?: ConversationMarkdownComponents;
  codeComponent: MarkdownComponents["code"];
  isStreaming?: boolean;
};

type MarkdownPreProps = ComponentProps;

const FORBIDDEN_HTML_TAGS = [
  "audio",
  "button",
  "embed",
  "form",
  "iframe",
  "input",
  "object",
  "script",
  "style",
  "video",
];

const MarkdownPre: React.FC<MarkdownPreProps> = ({
  children,
  domNode: _domNode,
  ...rest
}) => {
  const childArray = React.Children.toArray(children);
  const onlyChild = childArray.length === 1 ? childArray[0] : null;
  if (
    React.isValidElement<{ block?: boolean }>(onlyChild)
    && onlyChild.props.block
  ) {
    return <>{onlyChild}</>;
  }
  return <pre {...rest}>{children}</pre>;
};

export const ConversationMarkdown: React.FC<ConversationMarkdownProps> = ({
  content,
  className,
  components,
  codeComponent,
  isStreaming = false,
}) => {
  const { t } = useI18n();
  const [latexFailed, setLatexFailed] = useState(false);
  const processedContent = useMemo(
    () => removeEmptyMarkdownTables(content || ""),
    [content],
  );
  const needsLatex = useMemo(
    () => MATH_PATTERN.test(processedContent),
    [processedContent],
  );
  const [latexExtensions, setLatexExtensions] = useState<LatexExtensions | null>(
    null,
  );

  useEffect(() => {
    if (!needsLatex || latexExtensions) return;
    let cancelled = false;
    setLatexFailed(false);
    void loadLatexExtensions().then((extensions) => {
      if (!cancelled) {
        setLatexExtensions(extensions);
      }
    }).catch(() => { if (!cancelled) setLatexFailed(true); });
    return () => {
      cancelled = true;
    };
  }, [needsLatex, latexExtensions]);

  const markdownConfig = useMemo(
    () => ({
      gfm: true,
      breaks: true,
      // Plugin and renderer package entrypoints can expose distinct marked
      // declaration identities in the standalone export build.
      extensions: [markdownLocalMediaExtension, ...(latexExtensions || [])] as NonNullable<XMarkdownProps["config"]>["extensions"],
      renderer: literalFileTargetRenderer as NonNullable<XMarkdownProps["config"]>["renderer"],
    }),
    [latexExtensions],
  );
  const markdownComponents = useMemo<MarkdownComponents>(
    () => ({
      ...components,
      code: codeComponent,
      pre: MarkdownPre,
    }),
    [codeComponent, components],
  );

  if (!processedContent) return null;

  return (
    <MarkdownStreamingContext.Provider value={isStreaming}>
      {latexFailed && <span role="status">{t("markdown.mathLoadFailed")}</span>}
      <Markdown
        className={[styles.root, className].filter(Boolean).join(" ")}
        config={markdownConfig}
        components={markdownComponents}
        escapeRawHtml
        dompurifyConfig={{ FORBID_TAGS: FORBIDDEN_HTML_TAGS }}
      >
        {processedContent}
      </Markdown>
    </MarkdownStreamingContext.Provider>
  );
};

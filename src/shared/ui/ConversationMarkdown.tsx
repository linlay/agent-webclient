import React, { useEffect, useMemo, useState } from "react";
import {
  XMarkdown as Markdown,
  type ComponentProps,
  type XMarkdownProps,
} from "@ant-design/x-markdown";
import { removeEmptyMarkdownTables } from "./markdownPreprocess";
import styles from "./ConversationMarkdown.module.css";

type MarkdownComponents = NonNullable<XMarkdownProps["components"]>;

type LatexExtensions = ReturnType<
  (typeof import("@ant-design/x-markdown/plugins/Latex"))["default"]
>;

let latexExtensionsPromise: Promise<LatexExtensions> | null = null;

function loadLatexExtensions(): Promise<LatexExtensions> {
  if (!latexExtensionsPromise) {
    latexExtensionsPromise = import("@ant-design/x-markdown/plugins/Latex").then(
      (mod) => mod.default(),
    );
  }
  return latexExtensionsPromise;
}

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
}) => {
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
    void loadLatexExtensions().then((extensions) => {
      if (!cancelled) {
        setLatexExtensions(extensions);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [needsLatex, latexExtensions]);

  const markdownConfig = useMemo(
    () => ({
      gfm: true,
      breaks: true,
      ...(latexExtensions ? { extensions: latexExtensions } : {}),
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
    <Markdown
      className={[styles.root, className].filter(Boolean).join(" ")}
      config={markdownConfig}
      components={markdownComponents}
      escapeRawHtml
      dompurifyConfig={{ FORBID_TAGS: FORBIDDEN_HTML_TAGS }}
    >
      {processedContent}
    </Markdown>
  );
};

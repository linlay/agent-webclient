import React, { useMemo } from "react";
import {
  XMarkdown as Markdown,
  type ComponentProps,
  type XMarkdownProps,
} from "@ant-design/x-markdown";
import Latex from "@ant-design/x-markdown/plugins/Latex";
import { removeEmptyMarkdownTables } from "./markdownPreprocess";
import styles from "./ConversationMarkdown.module.css";

type MarkdownComponents = NonNullable<XMarkdownProps["components"]>;

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
  const markdownConfig = useMemo(
    () => ({
      gfm: true,
      breaks: true,
      extensions: Latex(),
    }),
    [],
  );
  const markdownComponents = useMemo<MarkdownComponents>(
    () => ({
      ...components,
      code: codeComponent,
      pre: MarkdownPre,
    }),
    [codeComponent, components],
  );
  const processedContent = useMemo(
    () => removeEmptyMarkdownTables(content || ""),
    [content],
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

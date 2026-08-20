import React, { useMemo } from "react";
import type { ComponentProps } from "@ant-design/x-markdown";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import styles from "./ConversationExportDocument.module.css";
import { SanitizedMarkup } from "./SanitizedMarkup";
import { StaticECharts } from "./StaticECharts";
import { StaticMermaid } from "./StaticMermaid";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("sh", shell);
hljs.registerLanguage("json", json);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);

export type StaticMarkdownCodeProps = ComponentProps;

export const StaticMarkdownCode: React.FC<StaticMarkdownCodeProps> = ({
  block,
  children,
  domNode: _domNode,
  lang,
  streamStatus: _streamStatus,
  ...rest
}) => {
  const source = useMemo(() => textFromReactNode(children), [children]);
  const language = getLanguage(lang);
  const highlighted = useMemo(
    () => highlightSource(source, language),
    [language, source],
  );

  if (!block) return <code {...rest}>{children}</code>;
  if (language === "echarts" || language === "chart") {
    return <StaticECharts source={source} />;
  }
  if (language === "mermaid") return <StaticMermaid source={source} />;

  return (
    <figure className={styles.codeBlock}>
      <figcaption>{language}</figcaption>
      <pre>
        <SanitizedMarkup
          as="code"
          className="hljs"
          html={highlighted}
          profile="highlight"
        />
      </pre>
    </figure>
  );
};

function getLanguage(value: unknown): string {
  const language =
    typeof value === "string"
      ? value.trim().split(/\s+/u)[0]?.toLowerCase()
      : "";
  return language || "plaintext";
}

function highlightSource(source: string, language: string): string {
  if (!hljs.getLanguage(language)) return escapeHtml(source);
  try {
    return hljs.highlight(source, {
      language,
      ignoreIllegals: true,
    }).value;
  } catch {
    return escapeHtml(source);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function textFromReactNode(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textFromReactNode).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return "";
}

import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import http from "highlight.js/lib/languages/http";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

// 与对话渲染使用同一套代码语言识别。
// 全量注册（192 种语言约 1.5MB）对入口体积不可接受；未注册语言走下方纯文本回退
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("go", go);
hljs.registerLanguage("graphql", graphql);
hljs.registerLanguage("http", http);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("php", php);
hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 未注册语言的语义别名：echarts 配置本质是 JSON，按 JSON 高亮
const LANGUAGE_ALIASES: Record<string, string> = {
  echart: "json",
  echarts: "json",
};

function resolveLanguage(language: string): string | undefined {
  const lang = (language || "").trim().split(/\s+/)[0]?.toLowerCase();
  if (!lang) {
    return undefined;
  }
  const aliased = LANGUAGE_ALIASES[lang] ?? lang;
  return hljs.getLanguage(aliased) ? aliased : undefined;
}

/**
 * Pure highlight projection: returns highlighted HTML for a code block.
 *
 * - `echart` / `echarts` blocks are aliased to `json` since their source is
 *   a JSON option object.
 * - Falls back to HTML-escaped plain text when the language is unknown to
 *   highlight.js (e.g. `mermaid`), keeping the raw source safe to inject while
 *   still rendering as plain text.
 */
export function buildHighlightedHtml(code: string, language: string): string {
  const lang = resolveLanguage(language);
  if (!lang) {
    return escapeHtml(code);
  }
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

/**
 * Memoized wrapper over `buildHighlightedHtml` for
 * `dangerouslySetInnerHTML`, keeping streaming re-renders cheap when the
 * source is unchanged.
 */
export function useHighlightCode(
  code: string,
  language: string,
): { __html: string } {
  return useMemo(
    () => ({ __html: buildHighlightedHtml(code, language) }),
    [code, language],
  );
}

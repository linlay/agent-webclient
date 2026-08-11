import { useMemo } from "react";
import hljs from "highlight.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Returns highlighted HTML (for `dangerouslySetInnerHTML`) for a code block.
 *
 * - Memoized on `code` and `language` so streaming re-renders stay cheap when
 *   the source is unchanged.
 * - Falls back to HTML-escaped plain text when the language is unknown to
 *   highlight.js (e.g. `mermaid`, `echart`), keeping the raw source safe to
 *   inject while still rendering as plain text.
 */
export function useHighlightCode(
  code: string,
  language: string,
): { __html: string } {
  return useMemo(() => {
    const lang = (language || "").trim().split(/\s+/)[0]?.toLowerCase();
    if (!lang || !hljs.getLanguage(lang)) {
      return { __html: escapeHtml(code) };
    }
    try {
      return {
        __html: hljs.highlight(code, {
          language: lang,
          ignoreIllegals: true,
        }).value,
      };
    } catch {
      return { __html: escapeHtml(code) };
    }
  }, [code, language]);
}

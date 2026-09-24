const MAX_PREVIEW_LENGTH = 200;
const COLLAPSED_WHITESPACE = " ";
const PREVIEW_ELLIPSIS = "…";

/**
 * 运行中思考折叠态的标题预览：取思考文本的尾部，保证始终露出最新内容。
 * - 空白折叠为单个空格，拼接后保持单行；
 * - 超长时只保留最后 200 字符并在行首加省略号，配合单行溢出隐藏，旧内容被裁掉、新内容始终可见。
 */
export function buildReasoningPreviewText(text: string): string {
  const collapsed = String(text || "")
    .replace(/[\t\v\f\r ]+/g, COLLAPSED_WHITESPACE)
    .replace(/\s*\n\s*/g, COLLAPSED_WHITESPACE)
    .trim();
  if (!collapsed) return "";
  if (collapsed.length <= MAX_PREVIEW_LENGTH) return collapsed;
  return (
    PREVIEW_ELLIPSIS + collapsed.slice(-(MAX_PREVIEW_LENGTH - 1)).trimStart()
  );
}

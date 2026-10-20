import type { TokenizerExtension } from "marked";

const markdownVideoExtensions = new Set([
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "webm",
]);

const markdownAudioExtensions = new Set([
  "aac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
]);

function getMarkdownResourceExtension(source: string): string {
  const normalized = String(source || "").trim();
  if (!normalized || /^(?:data|blob):/iu.test(normalized)) {
    return "";
  }

  const path = normalized.split(/[?#]/u, 1)[0] || "";
  const rawName = path.split("/").pop() || "";
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    return "";
  }

  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex < 0 || lastDotIndex === name.length - 1) {
    return "";
  }
  return name.slice(lastDotIndex + 1).toLowerCase();
}

/**
 * Backwards-compatible media detection for Markdown image syntax.
 * Standard Markdown has no video token, so an image whose source clearly
 * names a supported video file is upgraded to the authenticated video renderer.
 */
export function isMarkdownVideoSource(source: string | undefined): boolean {
  return markdownVideoExtensions.has(getMarkdownResourceExtension(source || ""));
}

export function getMarkdownVideoMimeType(source: string | undefined): string {
  switch (getMarkdownResourceExtension(source || "")) {
    case "m4v":
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "mpeg":
    case "mpg":
      return "video/mpeg";
    case "ogv":
      return "video/ogg";
    case "webm":
      return "video/webm";
    default:
      return "";
  }
}

/**
 * An image whose source names a supported audio file is upgraded to the
 * authenticated audio player, mirroring the video upgrade above.
 */
export function isMarkdownAudioSource(source: string | undefined): boolean {
  return markdownAudioExtensions.has(getMarkdownResourceExtension(source || ""));
}

export function getMarkdownAudioMimeType(source: string | undefined): string {
  switch (getMarkdownResourceExtension(source || "")) {
    case "aac":
      return "audio/aac";
    case "m4a":
      return "audio/mp4";
    case "mp3":
      return "audio/mpeg";
    case "oga":
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "weba":
      return "audio/webm";
    default:
      return "";
  }
}

/** Accept model-emitted local media paths containing spaces without changing code or web links. */
export const markdownLocalMediaExtension: TokenizerExtension = {
  name: "image",
  level: "inline",
  start: (source) => source.indexOf("!["),
  tokenizer(source) {
    const match = /^!\[([^\]\n]*)\]\(((?:@chat\/|@workspace\/|\/(?!\/))[^()<>\r\n]+)\)/iu.exec(source);
    if (!match) return;
    const href = match[2].trim();
    if (!/[ \t]/u.test(href) || !/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|aac|m4a|mp3|oga|ogg|opus|wav|weba|m4v|mov|mp4|mpeg|mpg|ogv|webm)$/iu.test(href)) return;
    return { type: "image", raw: match[0], href, text: match[1], title: null };
  },
};

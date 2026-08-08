const markdownVideoExtensions = new Set([
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "webm",
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

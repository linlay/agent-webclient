export interface WorkspaceFileLink {
  href: string;
  filePath: string;
  line?: number;
}

const ignoredHrefPrefixes = [
  "#",
  "/api/",
  "http://",
  "https://",
  "mailto:",
  "tel:",
  "data:",
  "blob:",
  "javascript:",
];

const knownWorkspaceFileExtensions = new Set([
  "aac",
  "avif",
  "bmp",
  "c",
  "cjs",
  "cpp",
  "css",
  "csv",
  "cts",
  "doc",
  "docm",
  "docx",
  "gif",
  "go",
  "htm",
  "html",
  "ico",
  "ini",
  "java",
  "jpeg",
  "jpg",
  "js",
  "json",
  "jsx",
  "log",
  "m4a",
  "m4v",
  "md",
  "mjs",
  "mov",
  "mp3",
  "mp4",
  "mpeg",
  "mpg",
  "mts",
  "oga",
  "ogg",
  "ogv",
  "opus",
  "pdf",
  "png",
  "pot",
  "potm",
  "potx",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "wav",
  "weba",
  "webm",
  "webp",
  "xhtml",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xml",
  "yaml",
  "yml",
]);

function safeDecodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function stripLineSuffix(path: string): {
  filePath: string;
  line?: number;
} {
  const match = /^(.*):(\d+)(?::\d+)?$/.exec(path);
  if (!match) {
    return { filePath: path };
  }
  return {
    filePath: match[1],
    line: Math.max(1, Number.parseInt(match[2], 10)),
  };
}

function looksLikeRelativeWorkspacePath(path: string): boolean {
  return (
    path.startsWith("./") ||
    path.startsWith("../") ||
    path.startsWith("src/") ||
    path.startsWith("docs/") ||
    path.startsWith("public/") ||
    path.startsWith("scripts/")
  );
}

function hasKnownWorkspaceFileExtension(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const filename = normalizedPath.split("/").pop() || "";
  const extensionIndex = filename.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === filename.length - 1) {
    return false;
  }
  return knownWorkspaceFileExtensions.has(
    filename.slice(extensionIndex + 1).toLowerCase(),
  );
}

function isResourceUrl(href: string): boolean {
  if (!href) return false;
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(href, origin);
    return url.pathname === "/api/resource";
  } catch {
    return href.startsWith("/api/resource");
  }
}

export function parseWorkspaceFileHref(
  href: string | undefined,
): WorkspaceFileLink | null {
  const rawHref = String(href || "").trim();
  if (!rawHref) return null;

  const lowerHref = rawHref.toLowerCase();
  if (ignoredHrefPrefixes.some((prefix) => lowerHref.startsWith(prefix))) {
    return null;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(rawHref) || rawHref.startsWith("//")) {
    return null;
  }
  if (isResourceUrl(rawHref)) {
    return null;
  }

  const decodedHref = safeDecodeHref(rawHref);
  const withoutLine = stripLineSuffix(decodedHref);
  const filePath = withoutLine.filePath.trim();
  if (!filePath) {
    return null;
  }

  const isAbsolutePosixPath = filePath.startsWith("/") && !filePath.startsWith("//");
  const isRelativeWorkspacePath =
    !filePath.startsWith("/") &&
    (looksLikeRelativeWorkspacePath(filePath) ||
      hasKnownWorkspaceFileExtension(filePath));
  if (!isAbsolutePosixPath && !isRelativeWorkspacePath) {
    return null;
  }

  return {
    href: rawHref,
    filePath,
    ...(withoutLine.line ? { line: withoutLine.line } : {}),
  };
}

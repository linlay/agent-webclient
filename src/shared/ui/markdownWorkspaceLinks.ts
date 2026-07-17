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
    !filePath.startsWith("/") && looksLikeRelativeWorkspacePath(filePath);
  if (!isAbsolutePosixPath && !isRelativeWorkspacePath) {
    return null;
  }

  return {
    href: rawHref,
    filePath,
    ...(withoutLine.line ? { line: withoutLine.line } : {}),
  };
}

import { isLiteralFileTarget } from "@/shared/utils/fileAddress";

export interface MarkdownWebLink {
  href: string;
  url: string;
  title: string;
}

export interface ParsedMarkdownWebLink {
  href: string;
  url: string;
}

export interface MarkdownAnchorActivation {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const NON_EXTERNAL_SCHEMES = new Set([
  "http", "https", "mailto", "tel", "ws", "wss", "file", "filesystem",
  "javascript", "vbscript", "data", "blob", "about", "view-source", "resource",
  "chrome", "chrome-extension", "chrome-untrusted", "devtools", "edge",
]);

export function parseMarkdownExternalProtocolHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048 ||
      /[\s\u0000-\u001f\u007f]/u.test(value) || isLiteralFileTarget(value)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):.+$/iu.exec(value)?.[1].toLowerCase();
  if (!scheme || NON_EXTERNAL_SCHEMES.has(scheme)) return null;
  try {
    new URL(value);
    return value;
  } catch {
    return null;
  }
}

function resolveBaseHref(baseHref?: string): string {
  if (baseHref) {
    return baseHref;
  }
  if (typeof window !== "undefined" && window.location?.href) {
    return window.location.href;
  }
  return "http://localhost/";
}

export function parseMarkdownWebHref(
  href: string | undefined,
  baseHref?: string,
): ParsedMarkdownWebLink | null {
  const rawHref = String(href || "").trim();
  if (!/^(?:https?:)?\/\//i.test(rawHref)) {
    return null;
  }

  try {
    const url = new URL(rawHref, resolveBaseHref(baseHref));
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return {
      href: rawHref,
      url: url.href,
    };
  } catch {
    return null;
  }
}

export function getMarkdownWebLinkFallbackTitle(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function shouldOpenWebLinkInSidebar(
  activation: MarkdownAnchorActivation,
): boolean {
  return (
    activation.button === 0 &&
    !activation.altKey &&
    !activation.ctrlKey &&
    !activation.metaKey &&
    !activation.shiftKey
  );
}

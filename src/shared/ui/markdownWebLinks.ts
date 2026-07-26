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

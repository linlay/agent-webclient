/** Mobile is a full client presentation, independent of Agent mode and transport. */
export function isMobilePath(pathname: string | undefined): boolean {
  return pathname === "/mobile" || Boolean(pathname?.startsWith("/mobile/"));
}

/**
 * Programmatic Composer focus stays off on the touch-first mobile shell so the
 * software keyboard never opens just from entering, switching or reloading a
 * conversation. Explicit focus requests (search, command palette, host bridge)
 * bypass this guard.
 */
export function allowsComposerAutoFocus(pathname?: string): boolean {
  const current = pathname ?? (typeof window === "undefined" ? undefined : window.location?.pathname);
  return !isMobilePath(current);
}

export function isFullClientPath(pathname: string): boolean {
  return pathname === "/" || isMobilePath(pathname);
}

export function buildClientLayoutHref(
  pathname: "/" | "/mobile",
  search: string,
  chatId?: string | null,
  agentKey?: string,
): string {
  const params = new URLSearchParams(search);
  for (const key of ["chatId", "agentKey", "newChat", "composerDraft", "composerSkill"]) {
    params.delete(key);
  }
  if (chatId) params.set("chatId", chatId);
  else if (pathname === "/mobile" && agentKey) params.set("agentKey", agentKey);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function toMobileRoute(target: string): string {
  // External URLs, hashes and relative navigation keep their original meaning.
  if (!target.startsWith("/") || target.startsWith("//") || isMobilePath(target.split(/[?#]/)[0])) return target;
  const url = new URL(target, "https://client.invalid");
  const agent = /^\/agent\/([^/]+)$/.exec(url.pathname);
  if (agent) {
    if (!url.searchParams.get("chatId")) url.searchParams.set("agentKey", decodeURIComponent(agent[1]));
    else url.searchParams.delete("agentKey");
    url.pathname = "/mobile";
  } else {
    url.pathname = url.pathname === "/" ? "/mobile" : `/mobile${url.pathname}`;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

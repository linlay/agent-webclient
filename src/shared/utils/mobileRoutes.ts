/** Mobile is a full client presentation, independent of Agent mode and transport. */
export function isMobilePath(pathname: string | undefined): boolean {
  return pathname === "/mobile" || Boolean(pathname?.startsWith("/mobile/"));
}

export function isFullClientPath(pathname: string): boolean {
  return pathname === "/" || isMobilePath(pathname);
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

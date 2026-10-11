const VISUALIZATION_ASSET_PATHS = new Set([
  "/assets/visualization/echarts.min.js",
  "/assets/visualization/mermaid.min.js",
  "/assets/visualization/preview.css",
]);

/** Resolve built-in assets against WebClient, even when an artifact has a blob
 * or Platform URL as its base. The stored HTML and other resource URLs stay intact. */
export function resolveHtmlVisualizationAssets(
  html: string,
  webclientUrl: string | undefined = globalThis.location?.href,
): string {
  if (!webclientUrl || typeof DOMParser === "undefined" || !html.includes("/assets/visualization/")) {
    return html;
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  for (const node of parsed.querySelectorAll("script[src], link[rel=stylesheet][href]")) {
    const attribute = node.tagName === "SCRIPT" ? "src" : "href";
    const value = node.getAttribute(attribute) || "";
    if (!VISUALIZATION_ASSET_PATHS.has(value)) continue;
    node.setAttribute(attribute, new URL(value, webclientUrl).href);
    changed = true;
  }
  return changed ? `<!doctype html>\n${parsed.documentElement.outerHTML}` : html;
}

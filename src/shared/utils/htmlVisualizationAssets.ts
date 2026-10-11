export const VISUALIZATION_ASSET_PATHS = new Set([
  "/assets/visualization/echarts.min.js",
  "/assets/visualization/mermaid.min.js",
  "/assets/visualization/preview.css",
]);

export function serializeHtmlDocument(document: Document): string {
  const doctype = document.doctype
    ? `${new XMLSerializer().serializeToString(document.doctype)}\n`
    : "";
  return `${doctype}${document.documentElement.outerHTML}`;
}

/** Update an already parsed document so preview policy injection needs one parse. */
export function resolveDocumentVisualizationAssets(document: Document, webclientUrl: string): boolean {
  let changed = false;
  for (const node of document.querySelectorAll("script[src], link[rel=stylesheet][href]")) {
    const attribute = node.tagName === "SCRIPT" ? "src" : "href";
    const value = node.getAttribute(attribute) || "";
    if (!VISUALIZATION_ASSET_PATHS.has(value)) continue;
    node.setAttribute(attribute, new URL(value, webclientUrl).href);
    changed = true;
  }
  return changed;
}

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
  const changed = resolveDocumentVisualizationAssets(parsed, webclientUrl);
  return changed ? serializeHtmlDocument(parsed) : html;
}

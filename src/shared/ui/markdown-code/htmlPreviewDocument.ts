import { resolveDocumentVisualizationAssets, serializeHtmlDocument } from "@/shared/utils/htmlVisualizationAssets";
import { HTML_PREVIEW_DEFAULT_HEIGHT, HTML_PREVIEW_MIN_HEIGHT } from "./htmlPreviewRuntime";

export const HTML_PREVIEW_MESSAGE = "markdown-html-preview";

export function isCompleteHtmlDocument(source: string): boolean {
  return /^(?:\s|<!--[\s\S]*?-->)*(?:<!doctype\s+html\b|<html(?:\s|>))/iu.test(source);
}

export function htmlPreviewCsp(webclientUrl: string): string | null {
  let url: URL;
  try { url = new URL(webclientUrl); } catch { return null; }
  if (!/^https?:$/u.test(url.protocol) || url.origin === "null") return null;
  const origin = url.origin;
  const assets = `${origin}/assets/visualization/`;
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${assets}echarts.min.js ${assets}mermaid.min.js`,
    `style-src 'unsafe-inline' ${assets}preview.css`,
    "img-src data: blob:", "font-src data:", "connect-src 'none'",
    "frame-src 'none'", "worker-src 'none'", "object-src 'none'",
    "form-action 'none'", "base-uri 'none'",
  ].join("; ");
}

export function buildHtmlPreviewDocument(source: string, token: string, webclientUrl: string, viewportHeight = HTML_PREVIEW_DEFAULT_HEIGHT): string | null {
  const csp = htmlPreviewCsp(webclientUrl);
  if (!csp) return null;
  const layoutHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : HTML_PREVIEW_DEFAULT_HEIGHT;
  const document = new DOMParser().parseFromString(source, "text/html");
  resolveDocumentVisualizationAssets(document, webclientUrl);
  document.querySelectorAll("base, meta[http-equiv], meta[name=referrer]").forEach(node => node.remove());
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = csp;
  const referrer = document.createElement("meta");
  referrer.name = "referrer";
  referrer.content = "no-referrer";
  const style = document.createElement("style");
  style.textContent = "html{overflow-y:hidden!important}";
  const bridge = document.createElement("script");
  bridge.textContent = `(() => {
    const token = ${JSON.stringify(token)};
    const type = ${JSON.stringify(HTML_PREVIEW_MESSAGE)};
    const send = (data) => parent.postMessage({ type, token, ...data }, "*");
    let pending = false;
    // Resolve viewport heights against the chat viewport, not the growing iframe.
    const layoutHeight = ${layoutHeight};
    const freezeStyle = (style, root) => {
      for (const property of Array.from(style)) {
        const original = style.getPropertyValue(property);
        let value = original.replace(/(-?\\d*\\.?\\d+)[dsl]?vh\\b/gi, (_, number) => (Number(number) * layoutHeight / 100) + "px");
        if (root && /^(?:min-|max-)?(?:height|block-size)$/.test(property)) {
          value = value.replace(/(-?\\d*\\.?\\d+)%/g, (_, number) => (Number(number) * layoutHeight / 100) + "px");
        }
        if (value !== original) style.setProperty(property, value, style.getPropertyPriority(property));
      }
    };
    let sheetsDirty = true;
    const dirtyInlineStyles = new Set();
    const collectInlineStyles = node => {
      if (!(node instanceof Element)) return;
      if (node.hasAttribute("style")) dirtyInlineStyles.add(node);
      node.querySelectorAll("[style]").forEach(element => dirtyInlineStyles.add(element));
    };
    const hasStyleSheet = node => node instanceof Element &&
      (node.matches("style,link[rel~=stylesheet]") || node.querySelector("style,link[rel~=stylesheet]"));
    const stabilizeViewportHeights = () => {
      const roots = [document.documentElement, document.body];
      for (const node of dirtyInlineStyles) {
        if (node.isConnected) freezeStyle(node.style, roots.includes(node));
      }
      dirtyInlineStyles.clear();
      if (!sheetsDirty) return;
      sheetsDirty = false;
      const visit = rules => Array.from(rules).forEach(rule => {
        if (rule.style) {
          let root = false;
          try { root = roots.some(node => node.matches(rule.selectorText)); } catch {}
          freezeStyle(rule.style, root);
        }
        if (rule.cssRules) visit(rule.cssRules);
      });
      for (const sheet of document.styleSheets) {
        try { visit(sheet.cssRules); } catch {}
      }
    };
    const measure = () => {
      pending = false;
      if (!document.body) return;
      stabilizeViewportHeights();
      const body = document.body;
      const margins = getComputedStyle(body);
      const bounds = body.getBoundingClientRect();
      let bottom = Math.max(bounds.bottom, bounds.top + body.scrollHeight);
      for (const child of body.children) bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
      const height = Math.ceil(bottom + window.scrollY + (parseFloat(margins.marginBottom) || 0));
      send({ event: "size", height: Math.max(${HTML_PREVIEW_MIN_HEIGHT}, height) });
    };
    const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(measure); } };
    addEventListener("DOMContentLoaded", () => {
      collectInlineStyles(document.documentElement);
      send({ event: "ready" });
      new ResizeObserver(schedule).observe(document.body);
      new MutationObserver(records => {
        for (const record of records) {
          if (record.type === "attributes" && record.attributeName === "style") dirtyInlineStyles.add(record.target);
          if (record.type === "attributes" &&
              (record.target === document.documentElement || record.target === document.body) &&
              (record.attributeName === "class" || record.attributeName === "id")) sheetsDirty = true;
          const element = record.target instanceof Element ? record.target : record.target.parentElement;
          if (element?.closest("style") || element?.matches("link[rel~=stylesheet]")) sheetsDirty = true;
          for (const node of record.addedNodes) {
            collectInlineStyles(node);
            if (hasStyleSheet(node)) sheetsDirty = true;
          }
          for (const node of record.removedNodes) if (hasStyleSheet(node)) sheetsDirty = true;
        }
        schedule();
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      document.addEventListener("load", event => {
        if (event.target instanceof Element && event.target.matches("link[rel~=stylesheet]")) { sheetsDirty = true; schedule(); }
      }, true);
      // CSSOM insertion does not produce DOM mutations. Invalidate only on edits.
      for (const method of ["insertRule", "deleteRule", "replace", "replaceSync"]) {
        const original = CSSStyleSheet.prototype[method];
        if (typeof original !== "function") continue;
        CSSStyleSheet.prototype[method] = function (...args) {
          const result = original.apply(this, args);
          sheetsDirty = true; schedule();
          if (result && typeof result.then === "function") result.then(() => { sheetsDirty = true; schedule(); }, () => {});
          return result;
        };
      }
      schedule();
    }, { once: true });
    addEventListener("resize", schedule);
    addEventListener("error", () => send({ event: "error" }));
    addEventListener("unhandledrejection", () => send({ event: "error" }));
    addEventListener("pagehide", () => send({ event: "navigate" }));
    document.addEventListener("click", event => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && !(anchor.getAttribute("href") || "").startsWith("#")) event.preventDefault();
    }, true);
  })();`;
  document.head.prepend(policy, referrer, style, bridge);
  return serializeHtmlDocument(document);
}

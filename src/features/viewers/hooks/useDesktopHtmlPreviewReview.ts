import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION,
  type AgentWebclientWorkPanelPreviewReviewAction,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { useDesktopCurrentPreviewReview } from "@/shared/data/desktop/desktopContextMenu";

const FRAME_ACTION = "__zenmindDesktopHtmlReviewAction";
const FRAME_EVENT = "__zenmindDesktopHtmlReviewEvent";

function emitReviewEvent(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT, {
    detail: { version: AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION, ...detail },
  }));
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function buildFrameBridgeScript(token: string) {
  const actionType = JSON.stringify(FRAME_ACTION);
  const eventType = JSON.stringify(FRAME_EVENT);
  const frameToken = JSON.stringify(token);
  return `(() => {
    const ACTION = ${actionType};
    const EVENT = ${eventType};
    const TOKEN = ${frameToken};
    const ROOT_ID = "__zenmind_artifact_html_review_overlay__";
    const COLOR = "#ff4d4f";
    let enabled = false;
    let annotations = [];
    let root = null;
    let hover = null;
    const invalidIds = new Set();
    const emit = (payload) => parent.postMessage({ type: EVENT, token: TOKEN, payload }, "*");
    const clean = (value, max) => String(value || "")
      .replace(/https?:\\/\\/\\S+/giu, "[url]")
      .replace(/\\b(token|secret|password|authorization|api[_-]?key)\\s*[:=]\\s*[^\\s,;]+/giu, "$1=[redacted]")
      .replace(/[A-Za-z0-9_-]{32,}/gu, "[redacted]")
      .replace(/\\s+/gu, " ").trim().slice(0, max);
    const ensureRoot = () => {
      if (root && root.isConnected) return root;
      root = document.createElement("div");
      root.id = ROOT_ID;
      Object.assign(root.style, {
        position: "fixed", inset: "0", zIndex: "2147483646", pointerEvents: "none",
        overflow: "visible", fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      });
      (document.body || document.documentElement).appendChild(root);
      return root;
    };
    const xpath = (element) => {
      const parts = [];
      let current = element;
      while (current) {
        const tag = current.tagName.toLowerCase();
        if (tag === "html") { parts.unshift("html"); break; }
        const parentElement = current.parentElement;
        if (!parentElement) return "";
        const siblings = Array.from(parentElement.children).filter((item) => item.tagName === current.tagName);
        const index = siblings.indexOf(current);
        parts.unshift(siblings.length > 1 ? tag + "[" + (index + 1) + "]" : tag);
        current = parentElement;
      }
      return parts.length ? "/" + parts.join("/") : "";
    };
    const selector = (element) => {
      if (element.id && element.id.length <= 120 && !/token|secret|password|auth|key/iu.test(element.id)) {
        try { return "#" + CSS.escape(element.id); } catch {}
      }
      const parts = [];
      let current = element;
      while (current && parts.length < 6) {
        const tag = current.tagName.toLowerCase();
        const parentElement = current.parentElement;
        if (!parentElement || tag === "html") { parts.unshift(tag); break; }
        const siblings = Array.from(parentElement.children).filter((item) => item.tagName === current.tagName);
        const index = siblings.indexOf(current);
        parts.unshift(siblings.length > 1 ? tag + ":nth-of-type(" + (index + 1) + ")" : tag);
        current = parentElement;
      }
      return parts.join(" > ").slice(0, 1024);
    };
    const resolve = (fullXPath) => {
      try {
        const result = document.evaluate(fullXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue instanceof Element ? result.singleNodeValue : null;
      } catch { return null; }
    };
    const targetAt = (x, y) => document.elementsFromPoint(x, y)
      .find((element) => !element.closest("#" + ROOT_ID)) || null;
    const box = (rect, number, dashed) => {
      const node = document.createElement("div");
      Object.assign(node.style, {
        position: "fixed", left: rect.left + "px", top: rect.top + "px",
        width: Math.max(0, rect.width) + "px", height: Math.max(0, rect.height) + "px",
        boxSizing: "border-box", border: "2px " + (dashed ? "dashed " : "solid ") + COLOR,
        background: dashed ? "rgba(255,77,79,.08)" : "rgba(255,77,79,.05)", pointerEvents: "none",
      });
      if (number !== undefined) {
        const label = document.createElement("span");
        label.textContent = String(number);
        Object.assign(label.style, {
          position: "absolute", left: "-12px", top: "-12px", display: "grid", placeItems: "center",
          width: "24px", height: "24px", borderRadius: "999px", color: "#fff", background: COLOR,
          font: "700 12px/1 sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,.24)",
        });
        node.appendChild(label);
      }
      return node;
    };
    const inspect = (element) => {
      const fullXPath = xpath(element);
      const rect = element.getBoundingClientRect();
      if (!fullXPath || rect.width <= 0 || rect.height <= 0) return null;
      const attributes = {};
      if (!(element instanceof HTMLInputElement && element.type.toLowerCase() === "password")) {
        ["role", "aria-label", "data-testid", "type", "name"].forEach((name) => {
          const value = clean(element.getAttribute(name), 160);
          if (value) attributes[name] = value;
        });
      }
      const sensitive = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        || Boolean(element.closest("input[type='password']"));
      return {
        event: "html-element-selected", fullXPath, cssSelector: selector(element),
        tagName: element.tagName.toLowerCase().slice(0, 64), attributes,
        textExcerpt: sensitive ? "" : clean(element.textContent, 240),
        rect: { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height },
      };
    };
    const render = () => {
      const overlay = ensureRoot();
      overlay.replaceChildren();
      hover = null;
      const layer = document.createElement("div");
      Object.assign(layer.style, {
        position: "fixed", inset: "0", pointerEvents: enabled ? "auto" : "none",
        cursor: enabled ? "crosshair" : "default", background: "transparent",
      });
      layer.onpointermove = (event) => {
        if (!enabled) return;
        const element = targetAt(event.clientX, event.clientY);
        hover?.remove();
        hover = element ? box(element.getBoundingClientRect(), undefined, true) : null;
        if (hover) overlay.appendChild(hover);
      };
      layer.onpointerdown = (event) => {
        if (!enabled || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
      };
      layer.onpointerup = (event) => {
        if (!enabled || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const element = targetAt(event.clientX, event.clientY);
        const inspected = element ? inspect(element) : null;
        if (inspected) emit(inspected);
      };
      layer.onclick = (event) => { if (enabled) { event.preventDefault(); event.stopPropagation(); } };
      overlay.appendChild(layer);
      annotations.forEach((annotation) => {
        const element = resolve(annotation.fullXPath);
        if (!element) {
          if (!invalidIds.has(annotation.id)) {
            invalidIds.add(annotation.id);
            emit({ event: "annotation-invalid", annotationId: annotation.id, reason: "xpath_unresolved" });
          }
          return;
        }
        invalidIds.delete(annotation.id);
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) overlay.appendChild(box(rect, annotation.number, false));
      });
    };
    addEventListener("message", (event) => {
      const data = event.data;
      if (event.source !== parent || !data || data.type !== ACTION || data.token !== TOKEN) return;
      enabled = data.enabled === true;
      annotations = Array.isArray(data.annotations) ? data.annotations.slice(0, 50).filter((item) =>
        item && item.kind === "html-element" && typeof item.id === "string"
        && Number.isSafeInteger(item.number) && typeof item.fullXPath === "string"
      ) : [];
      render();
      emit({ event: "ready", kind: "html", width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight });
    });
    addEventListener("scroll", render, true);
    addEventListener("resize", render);
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", render, { once: true });
    else render();
  })();`;
}

export function buildDesktopHtmlPreviewDocument(
  html: string,
  baseUrl: string,
  token: string,
) {
  const base = baseUrl ? `<base href="${escapeHtmlAttribute(baseUrl)}">` : "";
  const bridge = `${base}<script>${buildFrameBridgeScript(token)}</script>`;
  const head = /<head(?:\\s[^>]*)?>/iu.exec(html);
  if (head && head.index !== undefined) {
    const index = head.index + head[0].length;
    return `${html.slice(0, index)}${bridge}${html.slice(index)}`;
  }
  const htmlTag = /<html(?:\\s[^>]*)?>/iu.exec(html);
  if (htmlTag && htmlTag.index !== undefined) {
    const index = htmlTag.index + htmlTag[0].length;
    return `${html.slice(0, index)}<head>${bridge}</head>${html.slice(index)}`;
  }
  return `<!doctype html><html><head>${bridge}</head><body>${html}</body></html>`;
}

export function useDesktopHtmlPreviewReview(input: {
  enabled: boolean;
  fileName: string;
  sourceKey: string;
  html: string | null;
  baseUrl: string;
}) {
  const inputRef = useRef(input);
  inputRef.current = input;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);
  const lastSyncRef = useRef<AgentWebclientWorkPanelPreviewReviewAction | null>(null);
  const token = useMemo(
    () => `html-review-${stableHash(input.sourceKey)}-${Date.now().toString(36)}`,
    [input.sourceKey],
  );
  const revision = useMemo(
    () => stableHash(`${input.sourceKey}\u0000${input.html || ""}`),
    [input.html, input.sourceKey],
  );
  const srcDoc = useMemo(
    () => input.html === null
      ? null
      : input.enabled
        ? buildDesktopHtmlPreviewDocument(input.html, input.baseUrl, token)
        : input.html,
    [input.baseUrl, input.enabled, input.html, token],
  );

  const emitCapability = useCallback((requestId: string) => {
    const current = inputRef.current;
    // Capability means the HTML review surface is available, not that the
    // iframe has already fired `load`. Review sync is queued in lastSyncRef and
    // replayed by onLoad, so keeping this behind loadedRef can permanently
    // disable Desktop's Edit button when a fast srcDoc load wins the effect
    // ordering race.
    const available = current.enabled && current.html !== null;
    emitReviewEvent({
      event: "capability",
      requestId,
      kind: available ? "html" : null,
      ...(available ? {
        fileName: current.fileName.slice(0, 512),
        revision,
      } : {}),
    });
  }, [revision]);

  const postSync = useCallback((action: AgentWebclientWorkPanelPreviewReviewAction) => {
    const target = frameRef.current?.contentWindow;
    if (!target || !loadedRef.current) return;
    target.postMessage({
      type: FRAME_ACTION,
      token,
      enabled: action.enabled === true,
      annotations: action.annotations ?? [],
    }, "*");
  }, [token]);

  const handleAction = useCallback((action: AgentWebclientWorkPanelPreviewReviewAction) => {
    if (
      action.version !== AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION ||
      !action.requestId
    ) return;
    if (action.operation === "capabilities") {
      emitCapability(action.requestId);
      return;
    }
    if (action.kind !== "html" || (action.operation !== "initialize" && action.operation !== "sync")) return;
    lastSyncRef.current = action;
    postSync(action);
  }, [emitCapability, postSync]);

  useDesktopCurrentPreviewReview(input.enabled ? handleAction : null);

  useEffect(() => {
    loadedRef.current = false;
    lastSyncRef.current = null;
  }, [srcDoc]);

  useEffect(() => {
    if (!input.enabled || input.html === null) return;
    emitCapability(`available-${Date.now()}`);
  }, [emitCapability, input.enabled, input.html]);

  useEffect(() => {
    if (!input.enabled) return;
    const onMessage = (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      const data = event.data as Record<string, unknown> | null;
      if (
        !frameWindow || event.source !== frameWindow || !data || data.type !== FRAME_EVENT || data.token !== token ||
        !data.payload || typeof data.payload !== "object" || Array.isArray(data.payload)
      ) return;
      const payload = data.payload as Record<string, unknown>;
      if (!["ready", "html-element-selected", "annotation-invalid"].includes(String(payload.event || ""))) return;
      emitReviewEvent(payload);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [input.enabled, token]);

  const onLoad = useCallback(() => {
    loadedRef.current = true;
    emitCapability(`loaded-${Date.now()}`);
    const lastSync = lastSyncRef.current;
    if (lastSync) postSync(lastSync);
  }, [emitCapability, postSync]);

  return { frameRef, onLoad, srcDoc };
}

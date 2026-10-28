import { t } from "@/shared/i18n";

/**
 * Browser-side HTML element review (annotation) domain.
 *
 * The iframe bridge is intentionally text-based: the injected script talks to
 * the host with a narrow postMessage protocol and never receives the user's
 * requirement text. Only id/number/XPath are synced back into the preview.
 */

export const HTML_ELEMENT_REVIEW_ACTION = "agent-webclient:html-element-review:action";
export const HTML_ELEMENT_REVIEW_EVENT = "agent-webclient:html-element-review:event";
export const HTML_ELEMENT_REVIEW_MAX = 50;
export const HTML_ELEMENT_REQUIREMENT_MAX = 1000;
export const HTML_ELEMENT_XPATH_MAX = 1024;
export const HTML_ELEMENT_SELECTOR_MAX = 512;
export const HTML_ELEMENT_TEXT_MAX = 240;
export const HTML_ELEMENT_ATTRIBUTE_MAX = 160;
export const HTML_ELEMENT_BRIDGE_TIMEOUT_MS = 3000;

export const HTML_ELEMENT_ATTRIBUTE_NAMES = [
  "role",
  "aria-label",
  "data-testid",
  "type",
  "name",
] as const;

export type HtmlElementAttributeName = (typeof HTML_ELEMENT_ATTRIBUTE_NAMES)[number];
export type HtmlElementAttributes = Partial<Record<HtmlElementAttributeName, string>>;

export type HtmlElementReviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HtmlElementSelection = {
  fullXPath: string;
  cssSelector?: string;
  tagName?: string;
  attributes?: HtmlElementAttributes;
  textExcerpt?: string;
  /** Document coordinates (viewport offset + scroll), per the requirements. */
  rect: HtmlElementReviewRect;
};

export type HtmlElementReviewAnnotation = HtmlElementSelection & {
  id: string;
  number: number;
  requirement: string;
};

export type HtmlElementReviewPending = {
  selection: HtmlElementSelection;
  requirement: string;
};

export type HtmlElementReviewState = {
  annotating: boolean;
  pending: HtmlElementReviewPending | null;
  annotations: HtmlElementReviewAnnotation[];
  invalidIds: string[];
  listOpen: boolean;
};

export type HtmlElementReviewAction =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "SELECT"; selection: HtmlElementSelection }
  | { type: "PENDING_REQUIREMENT"; value: string }
  | { type: "CONFIRM_PENDING"; id: string }
  | { type: "CANCEL_PENDING" }
  | { type: "UPDATE_REQUIREMENT"; id: string; value: string }
  | { type: "REMOVE"; id: string }
  | { type: "INVALIDATE"; id: string }
  | { type: "VALIDATE"; id: string }
  | { type: "SET_LIST"; open: boolean }
  | { type: "RESET" };

export type HtmlElementReviewPayload = {
  version: 1;
  kind: "html-element";
  document: { fileName: string; revision: string };
  annotations: Array<{
    id: string;
    number: number;
    fullXPath: string;
    cssSelector?: string;
    tagName?: string;
    attributes?: HtmlElementAttributes;
    textExcerpt?: string;
    rect: HtmlElementReviewRect;
    requirement: string;
  }>;
};

export function createInitialHtmlElementReviewState(): HtmlElementReviewState {
  return {
    annotating: false,
    pending: null,
    annotations: [],
    invalidIds: [],
    listOpen: false,
  };
}

function clampText(value: string, max: number) {
  return value.slice(0, max);
}

function renumber(annotations: readonly HtmlElementReviewAnnotation[]) {
  return annotations.map((annotation, index) => ({ ...annotation, number: index + 1 }));
}

export function htmlElementReviewReducer(
  state: HtmlElementReviewState,
  action: HtmlElementReviewAction,
): HtmlElementReviewState {
  switch (action.type) {
    case "START":
      if (state.annotating) return state;
      return { ...state, annotating: true, pending: null, listOpen: false };
    case "STOP":
      if (!state.annotating && !state.pending) return state;
      return { ...state, annotating: false, pending: null, listOpen: false };
    case "SELECT": {
      if (!state.annotating || state.pending) return state;
      if (state.annotations.length >= HTML_ELEMENT_REVIEW_MAX) return state;
      return {
        ...state,
        pending: { selection: action.selection, requirement: "" },
        // The pending editor is its own surface; selecting an element must not
        // open (or keep open) the annotation list.
        listOpen: false,
      };
    }
    case "PENDING_REQUIREMENT": {
      if (!state.pending) return state;
      const requirement = clampText(action.value, HTML_ELEMENT_REQUIREMENT_MAX);
      if (requirement === state.pending.requirement) return state;
      return { ...state, pending: { ...state.pending, requirement } };
    }
    case "CONFIRM_PENDING": {
      if (!state.pending || state.annotations.length >= HTML_ELEMENT_REVIEW_MAX) return state;
      const requirement = state.pending.requirement.trim();
      if (!requirement) return state;
      const annotation: HtmlElementReviewAnnotation = {
        ...state.pending.selection,
        id: action.id,
        number: state.annotations.length + 1,
        requirement: clampText(requirement, HTML_ELEMENT_REQUIREMENT_MAX),
      };
      return {
        ...state,
        pending: null,
        annotations: [...state.annotations, annotation],
      };
    }
    case "CANCEL_PENDING":
      if (!state.pending) return state;
      return { ...state, pending: null };
    case "UPDATE_REQUIREMENT": {
      const value = clampText(action.value, HTML_ELEMENT_REQUIREMENT_MAX);
      let changed = false;
      const annotations = state.annotations.map((annotation) => {
        if (annotation.id !== action.id || annotation.requirement === value) return annotation;
        changed = true;
        return { ...annotation, requirement: value };
      });
      return changed ? { ...state, annotations } : state;
    }
    case "REMOVE": {
      const annotations = state.annotations.filter((annotation) => annotation.id !== action.id);
      if (annotations.length === state.annotations.length) return state;
      return {
        ...state,
        annotations: renumber(annotations),
        invalidIds: state.invalidIds.filter((id) => id !== action.id),
      };
    }
    case "INVALIDATE": {
      if (state.invalidIds.includes(action.id)) return state;
      if (!state.annotations.some((annotation) => annotation.id === action.id)) return state;
      return { ...state, invalidIds: [...state.invalidIds, action.id] };
    }
    case "VALIDATE": {
      if (!state.invalidIds.includes(action.id)) return state;
      return { ...state, invalidIds: state.invalidIds.filter((id) => id !== action.id) };
    }
    case "SET_LIST":
      if (state.listOpen === action.open) return state;
      return { ...state, listOpen: action.open };
    case "RESET":
      return createInitialHtmlElementReviewState();
    default:
      return state;
  }
}

export function isHtmlElementAnnotationSubmittable(
  annotation: HtmlElementReviewAnnotation,
  invalidIds: readonly string[],
) {
  return !invalidIds.includes(annotation.id) && annotation.requirement.trim().length > 0;
}

export function submittableHtmlElementAnnotations(
  annotations: readonly HtmlElementReviewAnnotation[],
  invalidIds: readonly string[],
) {
  return annotations.filter((annotation) =>
    isHtmlElementAnnotationSubmittable(annotation, invalidIds));
}

function displayFileName(value: unknown) {
  const name = String(value || "").trim();
  return (name.split(/[\\/]/u).pop() || "").slice(0, 512);
}

export function buildHtmlElementReviewPayload(input: {
  fileName: string;
  revision: string;
  annotations: readonly HtmlElementReviewAnnotation[];
  invalidIds: readonly string[];
}): HtmlElementReviewPayload | null {
  const annotations = submittableHtmlElementAnnotations(input.annotations, input.invalidIds)
    .slice(0, HTML_ELEMENT_REVIEW_MAX);
  if (annotations.length === 0) return null;
  return {
    version: 1,
    kind: "html-element",
    document: {
      fileName: displayFileName(input.fileName),
      revision: String(input.revision || ""),
    },
    annotations: annotations.map((annotation) => ({
      id: annotation.id,
      number: annotation.number,
      fullXPath: annotation.fullXPath,
      ...(annotation.cssSelector ? { cssSelector: annotation.cssSelector } : {}),
      ...(annotation.tagName ? { tagName: annotation.tagName } : {}),
      ...(annotation.attributes && Object.keys(annotation.attributes).length
        ? { attributes: annotation.attributes }
        : {}),
      ...(annotation.textExcerpt ? { textExcerpt: annotation.textExcerpt } : {}),
      rect: { ...annotation.rect },
      requirement: annotation.requirement.trim(),
    })),
  };
}

export function buildHtmlElementReviewText(input: {
  fileName: string;
  annotations: readonly HtmlElementReviewAnnotation[];
  invalidIds: readonly string[];
}) {
  const annotations = submittableHtmlElementAnnotations(input.annotations, input.invalidIds)
    .slice(0, HTML_ELEMENT_REVIEW_MAX);
  if (annotations.length === 0) return "";
  const lines = [t("contentViewer.htmlReview.request", { fileName: displayFileName(input.fileName) }), ""];
  annotations.forEach((annotation) => {
    lines.push(t("contentViewer.htmlReview.textItem", {
      number: annotation.number,
      xpath: annotation.fullXPath,
    }));
    lines.push(t("contentViewer.htmlReview.textRequirement", {
      requirement: annotation.requirement.trim(),
    }));
    lines.push("");
  });
  lines.push(t("contentViewer.htmlReview.textFooter"));
  return lines.join("\n").trim();
}

const REDACTED = "[redacted]";

export function sanitizeHtmlElementText(value: unknown, max = HTML_ELEMENT_TEXT_MAX): string {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/giu, "[url]")
    .replace(/Bearer\s+\S+/giu, `Bearer ${REDACTED}`)
    .replace(/\b(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/giu, `$1=${REDACTED}`)
    .replace(/[A-Za-z0-9_-]{32,}/gu, REDACTED)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function optionalText(value: unknown, max: number) {
  return typeof value === "string" ? clampText(value.trim(), max) : "";
}

export function normalizeHtmlElementSelection(value: unknown): HtmlElementSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const fullXPath = optionalText(record.fullXPath, HTML_ELEMENT_XPATH_MAX);
  if (!fullXPath.startsWith("/")) return null;

  const rectRecord = record.rect;
  if (!rectRecord || typeof rectRecord !== "object" || Array.isArray(rectRecord)) return null;
  const rect = rectRecord as Record<string, unknown>;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![x, y, width, height].every((part) => Number.isFinite(part))) return null;
  if (x < 0 || y < 0 || width < 1 || height < 1) return null;

  const attributes: HtmlElementAttributes = {};
  if (record.attributes && typeof record.attributes === "object" && !Array.isArray(record.attributes)) {
    const rawAttributes = record.attributes as Record<string, unknown>;
    HTML_ELEMENT_ATTRIBUTE_NAMES.forEach((name) => {
      const raw = rawAttributes[name];
      if (typeof raw !== "string") return;
      const cleaned = sanitizeHtmlElementText(raw, HTML_ELEMENT_ATTRIBUTE_MAX);
      if (cleaned) attributes[name] = cleaned;
    });
  }

  const cssSelector = optionalText(record.cssSelector, HTML_ELEMENT_SELECTOR_MAX);
  const tagName = optionalText(record.tagName, 64).toLowerCase();
  const textExcerpt = sanitizeHtmlElementText(record.textExcerpt, HTML_ELEMENT_TEXT_MAX);

  return {
    fullXPath,
    ...(cssSelector ? { cssSelector } : {}),
    ...(tagName ? { tagName } : {}),
    ...(Object.keys(attributes).length ? { attributes } : {}),
    ...(textExcerpt ? { textExcerpt } : {}),
    rect: {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
  };
}

/**
 * Injected into a sandboxed srcDoc iframe before the document's own CSP meta.
 * The page never receives requirement text; only annotations that it needs to
 * draw are posted to it.
 */
export function buildHtmlElementReviewScript(token: string) {
  return `(() => {
  const ACTION = ${JSON.stringify(HTML_ELEMENT_REVIEW_ACTION)};
  const EVENT = ${JSON.stringify(HTML_ELEMENT_REVIEW_EVENT)};
  const TOKEN = ${JSON.stringify(token)};
  const ROOT_ID = "__agent_webclient_html_review_overlay__";
  const STYLE_ID = "__agent_webclient_html_review_style__";
  const ACTIVE_CLASS = "__agent_webclient_html_review_active__";
  const MAX_ANNOTATIONS = ${HTML_ELEMENT_REVIEW_MAX};
  const MAX_TEXT = ${HTML_ELEMENT_TEXT_MAX};
  const MAX_XPATH = ${HTML_ELEMENT_XPATH_MAX};
  const MAX_SELECTOR = ${HTML_ELEMENT_SELECTOR_MAX};
  const MAX_ATTRIBUTE = ${HTML_ELEMENT_ATTRIBUTE_MAX};
  const ATTRIBUTE_NAMES = ${JSON.stringify(HTML_ELEMENT_ATTRIBUTE_NAMES)};
  const COLOR = "#ff4d4f";
  let enabled = false;
  let locked = false;
  let annotations = [];
  let root = null;
  let hover = null;
  let pointer = null;
  let pointerDown = null;
  let renderFrame = 0;
  let hoverFrame = 0;
  let dirty = true;
  let cached = new Map();
  let invalidEmitted = new Set();
  let previousUserSelect;
  let previousWebkitUserSelect;
  let resizeObserver = null;

  const emit = (payload) => {
    try { parent.postMessage({ type: EVENT, token: TOKEN, payload }, "*"); } catch (_error) {}
  };

  const clean = (value, max) => String(value == null ? "" : value).slice(0, 4000)
    .replace(/https?:\\/\\/\\S+/giu, "[url]")
    .replace(/Bearer\\s+\\S+/giu, "Bearer [redacted]")
    .replace(/\\b(token|password|secret|api[_-]?key)\\s*[:=]\\s*[^\\s,;]+/giu, "$1=[redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/gu, "[redacted]")
    .replace(/\\s+/gu, " ")
    .trim()
    .slice(0, max);

  const isSensitive = (element) => {
    const tag = element.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || tag === "script" || tag === "style" || Boolean(element.isContentEditable);
  };
  const isPassword = (element) => element.tagName === "INPUT" && String(element.getAttribute("type") || "").toLowerCase() === "password";

  const shadowHost = (element) => {
    let current = element;
    let guard = 0;
    while (current && guard < 16) {
      guard += 1;
      const rootNode = current.getRootNode ? current.getRootNode() : null;
      if (rootNode && rootNode.host) {
        current = rootNode.host;
        continue;
      }
      return current;
    }
    return element;
  };

  const xpath = (element) => {
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1) {
      const tag = current.tagName.toLowerCase();
      if (tag === "html") {
        parts.unshift("html");
        break;
      }
      const parent = current.parentElement;
      if (!parent) return "";
      const siblings = [];
      let index = -1;
      for (const child of parent.children) {
        if (child.tagName !== current.tagName) continue;
        siblings.push(child);
        if (child === current) index = siblings.length - 1;
      }
      if (index < 0) return "";
      parts.unshift(siblings.length > 1 ? tag + "[" + (index + 1) + "]" : tag);
      current = parent;
    }
    const value = parts.length ? "/" + parts.join("/") : "";
    return value.length <= MAX_XPATH ? value : "";
  };

  const selector = (element) => {
    if (element.id && element.id.length <= 120 && !/(token|secret|password|auth|key)/iu.test(element.id)) {
      try {
        if (typeof CSS !== "undefined" && CSS.escape) return "#" + CSS.escape(element.id);
      } catch (_error) {}
    }
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && parts.length < 6) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent || tag === "html") {
        parts.unshift(tag);
        break;
      }
      let index = 0;
      for (const child of parent.children) {
        if (child.tagName !== current.tagName) continue;
        index += 1;
        if (child === current) break;
      }
      parts.unshift(tag + ":nth-of-type(" + Math.max(1, index) + ")");
      current = parent;
    }
    return parts.join(" > ").slice(0, MAX_SELECTOR);
  };

  const documentRect = (element) => {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    return {
      x: Math.max(0, Math.round(rect.left + scrollX)),
      y: Math.max(0, Math.round(rect.top + scrollY)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    };
  };

  const inspect = (element) => {
    const target = shadowHost(element);
    if (!target || target.nodeType !== 1) return null;
    const fullXPath = xpath(target);
    const rect = documentRect(target);
    if (!fullXPath || !rect) return null;
    const attributes = {};
    if (!isPassword(target)) {
      ATTRIBUTE_NAMES.forEach((name) => {
        const value = clean(target.getAttribute(name), MAX_ATTRIBUTE);
        if (value) attributes[name] = value;
      });
    }
    return {
      fullXPath,
      cssSelector: selector(target),
      tagName: target.tagName.toLowerCase().slice(0, 64),
      attributes,
      textExcerpt: isSensitive(target) ? "" : clean(target.textContent, MAX_TEXT),
      rect
    };
  };

  const isOverlayNode = (node) => Boolean(root && node && (node === root || (node instanceof Node && root.contains(node))));

  const targetAt = (x, y) => {
    const list = document.elementsFromPoint
      ? document.elementsFromPoint(x, y)
      : (document.elementFromPoint ? [document.elementFromPoint(x, y)] : []);
    for (const element of list) {
      if (!element || element.nodeType !== 1) continue;
      if (isOverlayNode(element)) continue;
      return shadowHost(element);
    }
    return null;
  };

  const ensureRoot = () => {
    if (root && root.isConnected) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:visible;";
    (document.documentElement || document.body).appendChild(root);
    return root;
  };

  const box = (rect, number, dashed) => {
    const node = document.createElement("div");
    node.style.cssText = "position:fixed;left:" + rect.left + "px;top:" + rect.top + "px;width:" +
      Math.max(0, rect.width) + "px;height:" + Math.max(0, rect.height) + "px;box-sizing:border-box;" +
      "border:2px " + (dashed ? "dashed" : "solid") + " " + COLOR + ";background:" +
      (dashed ? "rgba(255,77,79,.08)" : "rgba(255,77,79,.05)") + ";pointer-events:none;";
    if (number !== undefined) {
      const badge = document.createElement("span");
      badge.textContent = String(number);
      badge.style.cssText = "position:absolute;left:-12px;top:-12px;display:grid;place-items:center;width:24px;height:24px;" +
        "border-radius:999px;color:#fff;background:" + COLOR + ";font:700 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.24);";
      node.appendChild(badge);
    }
    return node;
  };

  const resolveAnnotations = () => {
    cached = new Map();
    annotations.forEach((annotation) => {
      let element = null;
      try {
        const result = document.evaluate(annotation.fullXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue instanceof Element) element = result.singleNodeValue;
      } catch (_error) {}
      cached.set(annotation.id, element);
    });
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver.observe(document.documentElement);
      cached.forEach((element) => {
        if (element) resizeObserver.observe(element);
      });
    }
    dirty = false;
  };

  const render = () => {
    renderFrame = 0;
    if (!enabled) {
      if (root) root.replaceChildren();
      return;
    }
    const overlay = ensureRoot();
    overlay.replaceChildren();
    if (dirty) resolveAnnotations();
    const boxes = [];
    annotations.forEach((annotation) => {
      const element = cached.get(annotation.id);
      let rect = null;
      if (element && element.isConnected) {
        const measured = element.getBoundingClientRect();
        if (measured.width > 0 && measured.height > 0) rect = measured;
      }
      if (!rect) {
        if (!invalidEmitted.has(annotation.id)) {
          invalidEmitted.add(annotation.id);
          emit({ event: "annotation-invalid", annotationId: annotation.id, reason: element ? "zero_size" : "xpath_unresolved" });
        }
        return;
      }
      if (invalidEmitted.has(annotation.id)) {
        invalidEmitted.delete(annotation.id);
        emit({ event: "annotation-valid", annotationId: annotation.id });
      }
      boxes.push({ rect, number: annotation.number });
    });
    if (hover && !locked) {
      const measured = hover.getBoundingClientRect();
      if (measured.width > 0 && measured.height > 0) boxes.push({ rect: measured, dashed: true });
    }
    boxes.forEach((item) => overlay.appendChild(box(item.rect, item.number, item.dashed === true)));
  };

  const scheduleRender = () => {
    if (!renderFrame) renderFrame = requestAnimationFrame(render);
  };

  const updateHover = () => {
    hoverFrame = 0;
    if (!enabled || locked || !pointer) {
      if (hover) {
        hover = null;
        scheduleRender();
      }
      return;
    }
    const next = targetAt(pointer.x, pointer.y);
    if (next !== hover) {
      hover = next;
      scheduleRender();
    }
  };

  const clearHover = () => {
    pointerDown = null;
    if (!hover) return;
    hover = null;
    scheduleRender();
  };

  const onPointerMove = (event) => {
    if (!enabled) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (locked) {
      if (hover) {
        hover = null;
        scheduleRender();
      }
      return;
    }
    if (!hoverFrame) hoverFrame = requestAnimationFrame(updateHover);
  };

  const onPointerDown = (event) => {
    if (!enabled) return;
    if (isOverlayNode(event.target)) return;
    pointerDown = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      pointerType: event.pointerType
    };
    if (event.pointerType === "mouse" && event.target instanceof Element &&
        event.target !== document.documentElement && event.target !== document.body) {
      event.preventDefault();
    }
    event.stopImmediatePropagation();
  };

  const onPointerUp = (event) => {
    if (!enabled) return;
    event.stopImmediatePropagation();
    const start = pointerDown;
    pointerDown = null;
    if (!start || start.button !== 0 || event.button !== 0 || locked) return;
    if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) return;
    const element = targetAt(event.clientX, event.clientY);
    const inspected = element ? inspect(element) : null;
    if (!inspected) return;
    event.preventDefault();
    emit(Object.assign({ event: "html-element-selected" }, inspected));
  };

  const onClick = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onSubmit = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onDragStart = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onSelectStart = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onContextMenu = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onKeyDown = (event) => {
    if (!enabled || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    emit({ event: "escape" });
  };

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "html." + ACTIVE_CLASS + ",html." + ACTIVE_CLASS + " *{-webkit-user-select:none!important;user-select:none!important;cursor:crosshair!important;}";
    (document.head || document.documentElement).appendChild(style);
  };

  const updatePageState = () => {
    const html = document.documentElement;
    if (!html) return;
    if (enabled) {
      ensureStyle();
      if (previousUserSelect === undefined) previousUserSelect = html.style.userSelect;
      if (previousWebkitUserSelect === undefined) previousWebkitUserSelect = html.style.webkitUserSelect;
      html.classList.add(ACTIVE_CLASS);
      html.style.userSelect = "none";
      html.style.webkitUserSelect = "none";
    } else {
      html.classList.remove(ACTIVE_CLASS);
      if (previousUserSelect !== undefined) {
        html.style.userSelect = previousUserSelect;
        previousUserSelect = undefined;
      }
      if (previousWebkitUserSelect !== undefined) {
        html.style.webkitUserSelect = previousWebkitUserSelect;
        previousWebkitUserSelect = undefined;
      }
    }
  };

  addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== parent || !data || data.type !== ACTION || data.token !== TOKEN) return;
    enabled = data.enabled === true;
    locked = data.locked === true;
    if (!enabled) {
      hover = null;
      pointerDown = null;
    }
    annotations = Array.isArray(data.annotations) ? data.annotations.slice(0, MAX_ANNOTATIONS).filter((item) =>
      item && typeof item.id === "string" && item.id.length <= 128 &&
      Number.isSafeInteger(item.number) && item.number >= 1 &&
      typeof item.fullXPath === "string" && item.fullXPath.length > 0 && item.fullXPath.length <= MAX_XPATH
    ).map((item) => ({ id: item.id, number: item.number, fullXPath: item.fullXPath })) : [];
    invalidEmitted = new Set(Array.from(invalidEmitted).filter((id) => annotations.some((item) => item.id === id)));
    dirty = true;
    updatePageState();
    emit({
      event: "ready",
      kind: "html",
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    });
    render();
  }, false);

  const onMouseBlocked = (event) => {
    if (!enabled) return;
    event.stopImmediatePropagation();
  };

  ensureStyle();
  addEventListener("pointermove", onPointerMove, true);
  addEventListener("pointerdown", onPointerDown, true);
  addEventListener("pointerup", onPointerUp, true);
  addEventListener("mousedown", onMouseBlocked, true);
  addEventListener("mouseup", onMouseBlocked, true);
  addEventListener("click", onClick, true);
  addEventListener("submit", onSubmit, true);
  addEventListener("dragstart", onDragStart, true);
  addEventListener("selectstart", onSelectStart, true);
  addEventListener("contextmenu", onContextMenu, true);
  addEventListener("keydown", onKeyDown, true);
  addEventListener("scroll", scheduleRender, true);
  addEventListener("resize", scheduleRender);
  addEventListener("blur", clearHover);
  addEventListener("pointercancel", clearHover, true);
  if (document.documentElement) document.documentElement.addEventListener("pointerleave", clearHover);

  if (typeof MutationObserver === "function") {
    new MutationObserver((records) => {
      if (!enabled) return;
      for (const record of records) {
        const node = record.target;
        if (isOverlayNode(node)) continue;
        dirty = true;
        scheduleRender();
        return;
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(scheduleRender);
  }
})();`;
}

/**
 * Injects the review bridge immediately after <head>, before the document's own
 * CSP meta. A document without <head> gets one created around the existing HTML.
 */
export function buildHtmlElementReviewDocument(html: string, token: string) {
  const bridge = `<script>${buildHtmlElementReviewScript(token)}</script>`;
  const head = /<head(?:\s[^>]*)?>/iu.exec(html);
  if (head && head.index !== undefined) {
    const index = head.index + head[0].length;
    return `${html.slice(0, index)}${bridge}${html.slice(index)}`;
  }
  const htmlTag = /<html(?:\s[^>]*)?>/iu.exec(html);
  if (htmlTag && htmlTag.index !== undefined) {
    const index = htmlTag.index + htmlTag[0].length;
    return `${html.slice(0, index)}<head>${bridge}</head>${html.slice(index)}`;
  }
  return `<!doctype html><html><head>${bridge}</head><body>${html}</body></html>`;
}

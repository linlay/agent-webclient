// Ephemeral DOM anchors never enter references, storage, or the Desktop bridge.
//
// A live Range dies with the DOM it points at: switching chats unmounts the message a
// quote came from, and switching back rebuilds it as brand-new nodes. So every anchor
// also keeps a rebuildable locator — its host row id plus the quote's character offsets
// inside that row's text — and re-creates the Range on demand.
const HOST_ATTRIBUTE = "data-node-id";
const MAX_ANCHORS = 200;

type AnchorRecord = {
  /** Live range while the source DOM is mounted; released as soon as it detaches. */
  range: Range | null;
  /** The stored quote, used to verify whatever a live range or a fresh locator yields. */
  text: string;
  /** Host row id; empty when the quote never lived inside a timeline row. */
  hostId: string;
  /** Character offsets inside the host row text content; -1 when unknown. */
  start: number;
  end: number;
  /** DOM revision of the last failed re-location; a row that is not rendered yet must not
   *  be searched again on every rAF refresh, only once the document has changed. */
  missedAt: number | null;
};

const anchors = new Map<string, AnchorRecord>();

/** Bumped on every document mutation, so a missing row is only searched for when it can appear. */
let domRevision = 0;
if (typeof document !== "undefined" && typeof MutationObserver === "function") {
  new MutationObserver(() => { domRevision += 1; }).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

type AnchorRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

function elementOf(node: Node | null | undefined): Element | null {
  if (!node) return null;
  if (typeof Element !== "undefined" && node instanceof Element) return node;
  return node.parentElement ?? null;
}

function hostElementOf(node: Node | null | undefined): Element | null {
  return elementOf(node)?.closest(`[${HOST_ATTRIBUTE}]`) ?? null;
}

function findHostElement(hostId: string): Element | null {
  if (!hostId || typeof document === "undefined") return null;
  return document.querySelector(`[${HOST_ATTRIBUTE}="${hostId.replace(/["\\]/g, "\\$&")}"]`);
}

function isConnected(range: Range): boolean {
  return Boolean(range.startContainer?.isConnected && range.endContainer?.isConnected);
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** A rebuilt row can re-flow whitespace, so compare quotes the way the DOM renders them. */
function sameQuote(candidate: string, expected: string) {
  return (
    candidate.trim() === expected.trim() ||
    collapseWhitespace(candidate) === collapseWhitespace(expected)
  );
}

function textOffsetWithin(root: Element, node: Node, offset: number): number {
  if (node.nodeType !== 3 || !root.contains(node)) return -1;
  const doc = root.ownerDocument;
  if (!doc || typeof doc.createRange !== "function") return -1;
  try {
    const range = doc.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return -1;
  }
}

function positionAtTextOffset(root: Element, offset: number): { node: Node; offset: number } | null {
  if (offset < 0) return null;
  const doc = root.ownerDocument;
  if (!doc || typeof doc.createTreeWalker !== "function") return null;
  // 4 === NodeFilter.SHOW_TEXT
  const walker = doc.createTreeWalker(root, 4);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const length = node.nodeValue?.length || 0;
    if (offset <= seen + length) return { node, offset: Math.max(0, offset - seen) };
    seen += length;
    node = walker.nextNode();
  }
  return null;
}

function rangeFromOffsets(host: Element, start: number, end: number): Range | null {
  const doc = host.ownerDocument;
  if (!doc || start < 0 || end <= start) return null;
  const from = positionAtTextOffset(host, start);
  const to = positionAtTextOffset(host, end);
  if (!from || !to) return null;
  try {
    const range = doc.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    return range;
  } catch {
    return null;
  }
}

/** Collapses runs of whitespace while remembering where each kept character came from. */
function collapsedIndex(text: string) {
  const offsets: number[] = [];
  let value = "";
  let pendingSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/.test(text[index])) {
      pendingSpace = value.length > 0;
      continue;
    }
    if (pendingSpace) {
      value += " ";
      offsets.push(index);
      pendingSpace = false;
    }
    value += text[index];
    offsets.push(index);
  }
  return { value, offsets };
}

function nearestOccurrence(text: string, needle: string, hint: number) {
  let cursor = 0;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  while (cursor <= text.length) {
    const index = text.indexOf(needle, cursor);
    if (index === -1) break;
    const distance = hint >= 0 ? Math.abs(index - hint) : index;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
    cursor = index + needle.length;
  }
  return best < 0 ? null : { start: best, end: best + needle.length };
}

/** Offsets drift once a row re-renders, so a failed verification falls back to the quote itself. */
function searchQuoteRange(host: Element, quote: string, hint: number): Range | null {
  const needle = quote.trim();
  const text = host.textContent || "";
  if (!needle || !text) return null;
  const exact = nearestOccurrence(text, needle, hint);
  if (exact) return rangeFromOffsets(host, exact.start, exact.end);
  // Markdown 重排可能把引用的空白换了形状，按折叠后的文本再找一次。
  const collapsed = collapsedIndex(text);
  const relaxed = nearestOccurrence(collapsed.value, collapseWhitespace(needle), hint);
  if (!relaxed) return null;
  return rangeFromOffsets(
    host,
    collapsed.offsets[relaxed.start],
    collapsed.offsets[relaxed.end - 1] + 1,
  );
}

function relocate(record: AnchorRecord): Range | null {
  const host = findHostElement(record.hostId);
  if (!host) return null;
  const fromOffsets = rangeFromOffsets(host, record.start, record.end);
  if (fromOffsets && sameQuote(fromOffsets.toString(), record.text)) return fromOffsets;
  return searchQuoteRange(host, record.text, record.start);
}

function releaseStale() {
  for (const [key, record] of anchors) {
    if (record.range && !isConnected(record.range)) record.range = null;
    // Without a live range or a locator the anchor can never be drawn again.
    if (!record.range && !record.hostId) anchors.delete(key);
  }
}

/** The live range, or a rebuilt one when the source row was unmounted and mounted again. */
function usableRange(record: AnchorRecord): Range | null {
  if (record.range && isConnected(record.range) && sameQuote(record.range.toString(), record.text)) {
    return record.range;
  }
  if (!record.hostId) {
    if (record.range && !isConnected(record.range)) record.range = null;
    return null;
  }
  if (record.missedAt === domRevision) return null;
  const relocated = relocate(record);
  if (!relocated) {
    record.missedAt = domRevision;
    if (record.range && !isConnected(record.range)) record.range = null;
    return null;
  }
  record.missedAt = null;
  record.range = relocated;
  record.text = relocated.toString().trim() || record.text;
  return relocated;
}

export function rememberSelectedTextAnchor(id: string, range: Range, text: string) {
  releaseStale();
  const startHost = hostElementOf(range.startContainer);
  const host = startHost && startHost === hostElementOf(range.endContainer) ? startHost : null;
  anchors.set(id, {
    range: range.cloneRange(),
    text,
    hostId: host?.getAttribute(HOST_ATTRIBUTE)?.trim() || "",
    start: host ? textOffsetWithin(host, range.startContainer, range.startOffset) : -1,
    end: host ? textOffsetWithin(host, range.endContainer, range.endOffset) : -1,
    missedAt: null,
  });
  while (anchors.size > MAX_ANCHORS) anchors.delete(anchors.keys().next().value!);
}

export function selectedTextAnchorRects(id: string): AnchorRect[] {
  const record = anchors.get(id);
  const range = record ? usableRange(record) : null;
  if (!range) return [];
  try {
    const doc = range.startContainer.ownerDocument;
    const win = doc?.defaultView;
    if (!win) return [];
    let left = 0, top = 0, right = win.innerWidth, bottom = win.innerHeight;
    let parent = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
    while (parent) {
      const style = win.getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      parent = parent.parentElement;
    }
    return Array.from(range.getClientRects()).flatMap(rect => {
      const l = Math.max(left, rect.left), t = Math.max(top, rect.top);
      const r = Math.min(right, rect.right), b = Math.min(bottom, rect.bottom);
      return r > l && b > t ? [{left:l,top:t,right:r,bottom:b,width:r-l,height:b-t}] : [];
    });
  } catch { return []; }
}

/**
 * The row a quote lives in, so a caller can reveal that row before asking for the marker —
 * the target id of a selection is namespaced (a code block is not a row), the anchor is not.
 */
export function selectedTextAnchorHostId(id: string): string {
  return anchors.get(id)?.hostId?.trim() || "";
}

/**
 * Scrolls the source range back into view without touching the selection, and reports
 * whether the marker can actually be drawn: a row inside a collapsed panel may still be
 * connected while measuring nothing (height 0), and scrolling cannot fix that.
 */
export function revealSelectedTextAnchor(id: string): boolean {
  const record = anchors.get(id);
  const container = (record ? usableRange(record) : null)?.startContainer;
  if (!container?.isConnected) return false;
  const target = container.nodeType === 1
    ? container as Element
    : container.parentElement;
  if (!target?.isConnected) return false;
  target.scrollIntoView?.({ block: "center", inline: "nearest" });
  return selectedTextAnchorRects(id).length > 0;
}

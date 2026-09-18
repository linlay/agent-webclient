// Ephemeral DOM anchors never enter references, storage, or the Desktop bridge.
const anchors = new Map<string, { range: Range; text: string }>();
const MAX_ANCHORS = 200;

export function rememberSelectedTextAnchor(id: string, range: Range, text: string) {
  for (const [key, value] of anchors) {
    if (!value.range.startContainer.isConnected || !value.range.endContainer.isConnected) anchors.delete(key);
  }
  anchors.set(id, { range: range.cloneRange(), text });
  while (anchors.size > MAX_ANCHORS) anchors.delete(anchors.keys().next().value!);
}

export function selectedTextAnchorRects(id: string): { left: number; top: number; right: number; bottom: number; width: number; height: number }[] {
  const anchor = anchors.get(id);
  if (!anchor || !anchor.range.startContainer.isConnected || !anchor.range.endContainer.isConnected) return [];
  try {
    if (anchor.range.toString().trim() !== anchor.text.trim()) return [];
    const doc = anchor.range.startContainer.ownerDocument;
    const win = doc?.defaultView;
    if (!win) return [];
    let left = 0, top = 0, right = win.innerWidth, bottom = win.innerHeight;
    let parent = anchor.range.commonAncestorContainer.nodeType === 1
      ? anchor.range.commonAncestorContainer as Element : anchor.range.commonAncestorContainer.parentElement;
    while (parent) {
      const style = win.getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      parent = parent.parentElement;
    }
    return Array.from(anchor.range.getClientRects()).flatMap(rect => {
      const l = Math.max(left, rect.left), t = Math.max(top, rect.top);
      const r = Math.min(right, rect.right), b = Math.min(bottom, rect.bottom);
      return r > l && b > t ? [{left:l,top:t,right:r,bottom:b,width:r-l,height:b-t}] : [];
    });
  } catch { return []; }
}

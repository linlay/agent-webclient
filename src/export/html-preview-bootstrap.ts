import { prepareInlineShareHtml, prepareShareHtml, type ShareHtmlDelivery } from "./shareHtmlDocument";

/** Viewport units resolve against a fixed layout height, never the growing iframe. */
function observeInlineSize(viewportHeight: number, send: (data: object) => void): () => void {
  const layoutHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 360;
  const roots = [document.documentElement, document.body];
  const freeze = (style: CSSStyleDeclaration, root: boolean) => {
    for (const property of Array.from(style)) {
      let value = style.getPropertyValue(property).replace(/(-?\d*\.?\d+)[dsl]?vh\b/giu, (_, number: string) => `${Number(number) * layoutHeight / 100}px`);
      if (root && /^(?:min-|max-)?(?:height|block-size)$/u.test(property)) {
        value = value.replace(/(-?\d*\.?\d+)%/gu, (_, number: string) => `${Number(number) * layoutHeight / 100}px`);
      }
      if (value !== style.getPropertyValue(property)) style.setProperty(property, value, style.getPropertyPriority(property));
    }
  };
  document.querySelectorAll<HTMLElement>("[style]").forEach(node => freeze(node.style, roots.includes(node)));
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule || rule instanceof CSSKeyframeRule) {
        let root = false;
        if (rule instanceof CSSStyleRule) {
          try { root = roots.some(node => node.matches(rule.selectorText)); } catch { /* Invalid selectors are ignored by the browser. */ }
        }
        freeze(rule.style, root);
      }
      if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { visit(sheet.cssRules); } catch { /* Inaccessible sheets are blocked by CSP. */ }
  }
  let pending = 0;
  const measure = () => {
    pending = 0;
    const body = document.body;
    const bounds = body.getBoundingClientRect();
    let bottom = Math.max(bounds.bottom, bounds.top + body.scrollHeight);
    for (const child of Array.from(body.children)) bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
    send({ type: "size", height: Math.max(1, Math.ceil(bottom + window.scrollY + (parseFloat(getComputedStyle(body).marginBottom) || 0))) });
  };
  const schedule = () => { if (!pending) pending = requestAnimationFrame(measure); };
  const observer = new ResizeObserver(schedule);
  observer.observe(document.body);
  window.addEventListener("resize", schedule);
  document.addEventListener("load", schedule, true);
  measure();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(pending);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("load", schedule, true);
  };
}

const shareOrigin = document.querySelector<HTMLMetaElement>('meta[name="conversation-share-origin"]')?.content;
if (shareOrigin && window.parent !== window) {
  const connect = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== shareOrigin || event.data?.type !== "conversation-html-connect") return;
    window.removeEventListener("message", connect);
    const channel = new MessageChannel();
    channel.port1.onmessage = (delivery: MessageEvent<ShareHtmlDelivery>) => {
      channel.port1.onmessage = null;
      const urls: string[] = [];
      let stopSize: (() => void) | undefined;
      const send = (data: object) => channel.port1.postMessage(data);
      try {
        const payload = delivery.data;
        if (payload.kind === "inline") {
          const prepared = prepareInlineShareHtml(payload.html);
          // Retain the network document, its HTTP CSP and bootstrap's closure.
          document.documentElement.replaceWith(document.importNode(prepared.documentElement, true));
          stopSize = observeInlineSize(payload.viewportHeight, send);
          send({ type: "rendered" });
        } else if (payload.kind === "attachment") {
          const html = prepareShareHtml(payload.content, blob => {
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return url;
          });
          // Attachments retain their existing script/resource capabilities.
          document.open();
          document.write(html);
          document.close();
          if (document.readyState === "complete") send({ type: "rendered" });
          else window.addEventListener("load", () => send({ type: "rendered" }), { once: true });
        } else throw new Error("Invalid preview payload");
        window.addEventListener("pagehide", () => {
          send({ type: "navigate" });
          stopSize?.();
          urls.forEach(url => URL.revokeObjectURL(url));
          channel.port1.close();
        }, { once: true });
      } catch {
        stopSize?.();
        urls.forEach(url => URL.revokeObjectURL(url));
        send({ type: "error" });
        channel.port1.close();
      }
    };
    window.parent.postMessage({ type: "conversation-html-ready" }, shareOrigin, [channel.port2]);
  };
  window.addEventListener("message", connect);
}

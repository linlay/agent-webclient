import type { ViewDocument } from "@/shared/contracts/view";

const VIEW_CSP = "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";

/**
 * Host adapter injected first into every display view. It is not part of the
 * frozen snapshot, so it always matches the host protocol:
 *   viewHost.onData((payload, view, context) => …)  — view_init/view_update;
 *     payload = Markdown view input or tool result;
 *     context = { queryable, actionable, locale, colorScheme }
 *   viewHost.query(name, params) → Promise<{data, executedAt}>  — declared queries only;
 *     a newer call with the same name rejects the older one with view_query_superseded
 *   viewHost.resize()                               — re-reports the height
 * Frozen legacy templates retain zenmindView with query() returning raw data.
 * Native, CLI and MCP queries share this interface for every connector.
 * Height is reported as {type:"view_resize",height}; the host applies it with
 * a 48px floor and no ceiling, so content must not size itself by vh units.
 */
export const VIEW_DISPLAY_SDK = `(() => {
  'use strict';
  const handlers = [];
  const pending = new Map();
  let last = null, frame = 0, lastHeight = 0, sequence = 0;
  function measure() {
    frame = 0;
    const body = document.body;
    if (!body) return;
    const marginBottom = parseFloat(getComputedStyle(body).marginBottom) || 0;
    const height = Math.ceil(body.getBoundingClientRect().bottom + scrollY + marginBottom);
    if (height <= 0 || height === lastHeight) return;
    lastHeight = height;
    parent.postMessage({ type: 'view_resize', height }, '*');
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
  function deliver(handler) {
    try { handler(last.payload, last.view, last.context || {}); } catch (error) { console.error(error); }
  }
  function applyContext(context) {
    const root = document.documentElement;
    if (context.colorScheme === 'dark' || context.colorScheme === 'light') {
      root.dataset.colorScheme = context.colorScheme;
      root.style.colorScheme = context.colorScheme;
    }
    if (typeof context.locale === 'string' && context.locale) root.lang = context.locale;
  }
  addEventListener('message', event => {
    if (event.source !== parent) return;
    const message = event.data;
    if ((message?.type === 'view_query_result' || message?.type === 'view_invoke_result')) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.ok) request.resolve({ data: message.data, executedAt: message.executedAt, ...(message.type === "view_invoke_result" ? { invocationId: message.invocationId, exitCode: message.exitCode } : {}) });
      else request.reject(new Error(String(message.error || 'view_query_failed')));
      return;
    }
    if (message?.type !== 'view_init' && message?.type !== 'view_update') return;
    last = message.data || {};
    applyContext(last.context || {});
    handlers.forEach(deliver);
    schedule();
  });
  function observe() {
    if (!document.body) { addEventListener('DOMContentLoaded', observe, { once: true }); return; }
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(document.body);
    schedule();
  }
  observe();
  addEventListener('resize', schedule);
  window.viewHost = Object.freeze({
    onData(handler) {
      if (typeof handler !== 'function') return;
      handlers.push(handler);
      if (last) deliver(handler);
    },
    query(name, params) {
      const id = 'q' + (++sequence);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        parent.postMessage({ type: 'view_query', id, query: String(name), params: params || {} }, '*');
      });
    },
    invoke(name, params) {
      const id = 'a' + (++sequence);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        parent.postMessage({ type: 'view_invoke', id, action: String(name), params: params || {} }, '*');
      });
    },
    invokeBatch(name, entries) {
      const id = 'a' + (++sequence);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        parent.postMessage({ type: 'view_invoke', id, action: String(name), params: entries, batch: true }, '*');
      });
    },
    resize() { lastHeight = 0; schedule(); },
  });
  // Historical snapshots keep their original scripts and return-value contract.
  window.zenmindView = Object.freeze({
    onData: window.viewHost.onData,
    query(name, params) { return window.viewHost.query(name, params).then(result => result.data); },
    resize: window.viewHost.resize,
  });
})();`;

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

function decodeText(data: string): string {
  return decodeURIComponent(Array.from(atob(data), byte => `%${byte.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
}

// QLC remains a structured payload. Unknown widget schemas have an explicit
// JSON fallback; we do not execute expressions from a QLC definition.
function structuredHTML(document: ViewDocument, usage: "display" | "form"): string {
  const definition = escapeHTML(JSON.stringify(document.qlc || {}, null, 2));
  if (usage === "display") return `<pre id="result"></pre><details><summary>QLC</summary><pre>${definition}</pre></details><script>addEventListener('message',e=>{if(e.source!==parent)return;const m=e.data;if(m?.type==='view_init'||m?.type==='view_update')document.getElementById('result').textContent=JSON.stringify(m.data?.payload,null,2)});</script>`;
  return `<label>JSON<textarea id="form" style="width:100%;min-height:220px" spellcheck="false"></textarea></label><p id="error" role="alert"></p><details><summary>QLC</summary><pre>${definition}</pre></details><script>
let state=null;
addEventListener('message',e=>{
 if(e.source!==parent)return;const m=e.data;
 if(m?.type==='awaiting_init'||m?.type==='awaiting_update'){state=m.data;document.getElementById('form').value=JSON.stringify((state.form&&state.form.data)||{},null,2);document.getElementById('error').textContent='';}
 if(m?.type==='awaiting_collect'&&state){try{const form=JSON.parse(document.getElementById('form').value);if(!form||typeof form!=='object'||Array.isArray(form))throw new Error('JSON object required');parent.postMessage({type:'frontend_awaiting_submit',param:{decision:m.data&&m.data.decision==='reject'?'reject':'approve',data:form}},'*');}catch(error){document.getElementById('error').textContent=String(error.message);}}
});</script>`;
}

/** Only declared snapshot resources are embedded. No connector/config URL is
 * exposed to the frame. The caller must also use sandbox="allow-scripts". */
export function viewDocumentHTML(document: ViewDocument, usage: "display" | "form"): string {
  if (!document?.view || !["html", "qlc"].includes(document.view.renderer || "")) throw new Error("Unsupported VIEW renderer");
  const html = document.view.renderer === "qlc" ? structuredHTML(document, usage) : document.html;
  if (!html?.trim()) throw new Error("VIEW response has no content");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("base, meta[http-equiv]").forEach(node => node.remove());
  const assets = new Map((document.assets || []).map(asset => [asset.path, asset]));
  const resolve = (value: string, from: string): string => {
    if (!value || value.startsWith("#") || value.startsWith("data:")) return value;
    const url = new URL(value, `https://view.invalid/${from}`);
    if (url.origin !== "https://view.invalid") return "";
    const asset = assets.get(decodeURIComponent(url.pathname.slice(1)));
    if (!asset || !/^[\w.+-]+\/[\w.+-]+(?:;[\w= .-]+)?$/.test(asset.mediaType)) return "";
    return `data:${asset.mediaType};base64,${asset.data}${url.hash}`;
  };
  const css = (value: string, from: string) => value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote, url) => `url("${resolve(url, from).replace(/"/g, "%22")}")`);
  const entry = document.entry || "views/index.html";
  parsed.querySelectorAll("link[rel=stylesheet]").forEach(node => {
    const url = new URL(node.getAttribute("href") || "", `https://view.invalid/${entry}`);
    const path = decodeURIComponent(url.pathname.slice(1));
    const asset = url.origin === "https://view.invalid" ? assets.get(path) : undefined;
    if (!asset) { node.remove(); return; }
    const style = parsed.createElement("style");
    style.textContent = css(decodeText(asset.data), path);
    node.replaceWith(style);
  });
  parsed.querySelectorAll("[src], [href], [poster]").forEach(node => {
    for (const name of ["src", "href", "poster"]) {
      const value = node.getAttribute(name);
      if (value !== null) node.setAttribute(name, resolve(value, entry));
    }
  });
  parsed.querySelectorAll("[srcset]").forEach(node => node.removeAttribute("srcset"));
  parsed.querySelectorAll("style").forEach(node => { node.textContent = css(node.textContent || "", entry); });
  parsed.querySelectorAll("[style]").forEach(node => node.setAttribute("style", css(node.getAttribute("style") || "", entry)));
  // The SDK runs before template scripts so they can register onData.
  if (usage === "display") {
    const sdk = parsed.createElement("script");
    sdk.setAttribute("data-zenmind-view", "");
    sdk.textContent = VIEW_DISPLAY_SDK;
    parsed.head.prepend(sdk);
  }
  const policy = parsed.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = VIEW_CSP;
  parsed.head.prepend(policy);
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

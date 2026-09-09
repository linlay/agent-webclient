function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function createDocxFrameHtml(token: string, assets: { zip: string; docx: string }): string {
  // Only our nonced runtime and packaged libraries execute. Document-provided
  // scripts/events, remote assets, forms and top navigation remain blocked.
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${token}'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>html,body{margin:0;min-height:100%;background:#e9ebef}body{font-family:Arial,sans-serif;color:#171717}#pages{padding:20px;transform-origin:top left}section.docx{background:white;margin:0 auto 20px;box-shadow:0 2px 10px #0002;flex-shrink:0}*{box-sizing:border-box}a{color:inherit;pointer-events:none}</style>
</head><body><div id="styles"></div><div id="pages"></div>
<script nonce="${token}" src="${escapeAttribute(assets.zip)}"></script>
<script nonce="${token}" src="${escapeAttribute(assets.docx)}"></script>
<script nonce="${token}">(${docxFrameRuntime.toString()})(${JSON.stringify(token)});</script></body></html>`;
}

// Runs entirely inside sandbox="allow-scripts" with an opaque origin.
// Keep all dependencies inside this function so its serialized body is standalone.
function docxFrameRuntime(token: string) {
  const post = (state: string, extra: Record<string, unknown> = {}) => parent.postMessage({ type: "docx-preview", token, state, ...extra }, "*");
  let pages: HTMLElement[] = [];
  let zoom = "fit";
  let started = false;
  const content = document.getElementById("pages")!;
  const fit = () => {
    const width = Math.max(...pages.map((page) => page.offsetWidth), 1);
    content.style.zoom = String(zoom === "fit" ? Math.min(1, Math.max(0.1, (innerWidth - 40) / width)) : Number(zoom));
  };
  const sendPage = () => {
    let page = 1;
    pages.forEach((item, index) => { if (item.getBoundingClientRect().top < 80) page = index + 1; });
    if (pages.length) post("page", { page });
  };
  addEventListener("click", (event) => { if ((event.target as Element)?.closest?.("a")) event.preventDefault(); }, true);
  addEventListener("submit", (event) => event.preventDefault(), true);
  addEventListener("resize", fit);
  addEventListener("scroll", sendPage, { passive: true });
  addEventListener("message", (event) => {
    if (event.source !== parent || event.data?.token !== token || event.data?.type !== "docx-command") return;
    const command = event.data;
    if (command.action === "ping") { post("ready"); return; }
    if (command.action === "zoom" && ["fit", "0.5", "0.75", "1", "1.25", "1.5", "2"].includes(command.value)) {
      zoom = command.value; fit(); return;
    }
    if (command.action === "page" && Number.isInteger(command.page) && command.page >= 1 && command.page <= pages.length) {
      pages[command.page - 1].scrollIntoView({ block: "start" }); post("page", { page: command.page }); return;
    }
    if (command.action !== "render" || started || !(command.data instanceof ArrayBuffer)) return;
    started = true;
    const renderer = (window as typeof window & { docx: { renderAsync: (...args: unknown[]) => Promise<unknown> } }).docx;
    Promise.resolve().then(() => renderer.renderAsync(command.data, content, document.getElementById("styles"), {
      inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false,
      renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
      renderAltChunks: false, ignoreFonts: true, useBase64URL: true,
    })).then(() => {
      content.querySelectorAll("a").forEach((link) => { link.removeAttribute("href"); link.removeAttribute("target"); });
      pages = Array.from(content.querySelectorAll<HTMLElement>("section.docx"));
      if (!pages.length) throw new Error("empty_docx");
      fit(); post("rendered", { pages: pages.length });
    }).catch(() => post("error"));
  });
  post("ready");
}

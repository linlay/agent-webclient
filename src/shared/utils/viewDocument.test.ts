/** @jest-environment jsdom */
import { VIEW_DISPLAY_SDK, viewDocumentHTML } from "./viewDocument";
const view = { source: "connector", connectorId: "forms", key: "edit", renderer: "html" as const };
test("VIEW embeds only declared resources and pins an isolated CSP", () => {
  const html = viewDocumentHTML({ view, entry: "views/index.html", html: '<base href="https://bad.example"><meta http-equiv="refresh" content="0;url=https://bad.example"><script src="app.js"></script><img src="private.png"><link rel="stylesheet" href="style.css"><a href="https://bad.example">open</a>', assets: [
    { path: "views/app.js", mediaType: "text/javascript", data: btoa("document.body.dataset.ready='yes'") },
    { path: "views/style.css", mediaType: "text/css", data: btoa("body{background:url(icon.svg)}") },
    { path: "views/icon.svg", mediaType: "image/svg+xml", data: btoa("<svg/>") },
  ] }, "display");
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelector("base")).toBeNull();
  expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull();
  expect(doc.querySelector("meta")?.content).toContain("connect-src 'none'");
  expect(doc.querySelector("script[src]")?.getAttribute("src")).toMatch(/^data:text\/javascript;base64,/);
  expect(doc.querySelector("img")?.getAttribute("src")).toBe("");
  expect(doc.querySelector("a")?.getAttribute("href")).toBe("");
  expect(doc.querySelector("style")?.textContent).toContain("data:image/svg+xml;base64,");
});
test("QLC definition is text and form collection retains HITL protocol", () => {
  const html = viewDocumentHTML({ view: { ...view, renderer: "qlc" }, qlc: { title: "</pre><script>bad()</script>" } }, "form");
  expect(html).toContain("&lt;script&gt;bad()");
  expect(html).toContain("awaiting_collect");
  expect(html).toContain("frontend_awaiting_submit");
});

test("display views get the host SDK before template scripts; forms do not", () => {
  const display = new DOMParser().parseFromString(viewDocumentHTML({ view, html: "<head><script>window.mine=1</script></head><body></body>" }, "display"), "text/html");
  const scripts = Array.from(display.querySelectorAll("script"));
  expect(scripts[0].hasAttribute("data-zenmind-view")).toBe(true);
  expect(scripts[1].textContent).toBe("window.mine=1");
  expect(display.head.firstElementChild?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
  const form = viewDocumentHTML({ view, html: "<p>form</p>" }, "form");
  expect(form).not.toContain("data-zenmind-view");
});

test("SDK delivers host data to late and early handlers and reports height", () => {
  const posted: unknown[] = [];
  const original = window.postMessage;
  window.postMessage = ((message: unknown) => { posted.push(message); }) as typeof window.postMessage;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => { callback(0); return 1; }) as typeof window.requestAnimationFrame;
  try {
    new Function(VIEW_DISPLAY_SDK)();
    const sdk = (window as unknown as { zenmindView: { onData: (fn: (payload: unknown, view: unknown) => void) => void } }).zenmindView;
    const early: unknown[] = [];
    sdk.onData((payload) => early.push(payload));
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_init", data: { view, payload: { count: 1 } } } }));
    window.dispatchEvent(new MessageEvent("message", { source: null, data: { type: "view_update", data: { payload: { forged: true } } } }));
    const late: unknown[] = [];
    sdk.onData((payload) => late.push(payload));
    expect(early).toEqual([{ count: 1 }]);
    expect(late).toEqual([{ count: 1 }]);
    expect(posted.every((message) => (message as { type: string }).type === "view_resize")).toBe(true);
  } finally {
    window.postMessage = original;
  }
});

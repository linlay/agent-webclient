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
    const sdk = (window as unknown as { viewHost: { onData: (fn: (payload: unknown, view: unknown) => void) => void } }).viewHost;
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

test("SDK query round-trips through the host and applies host theme", async () => {
  const posted: Array<Record<string, unknown>> = [];
  const original = window.postMessage;
  window.postMessage = ((message: Record<string, unknown>) => { posted.push(message); }) as typeof window.postMessage;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => { callback(0); return 1; }) as typeof window.requestAnimationFrame;
  try {
    new Function(VIEW_DISPLAY_SDK)();
    const sdk = (window as unknown as { viewHost: {
      onData: (fn: (payload: unknown, view: unknown, context: Record<string, unknown>) => void) => void;
      query: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
    } }).viewHost;
    const contexts: Array<Record<string, unknown>> = [];
    sdk.onData((_payload, _view, context) => contexts.push(context));
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_init", data: { view, payload: null, context: { queryable: true, colorScheme: "dark", locale: "zh-CN", query: { name: "list", params: { limit: 5 } } } } } }));
    expect(contexts[0]).toMatchObject({ queryable: true, query: { name: "list", params: { limit: 5 } } });
    expect(document.documentElement.dataset.colorScheme).toBe("dark");
    expect(document.documentElement.lang).toBe("zh-CN");

    const ok = sdk.query("list", { offset: 20 });
    const request = posted.find((message) => message.type === "view_query") as { id: string; query: string; params: unknown };
    expect(request).toMatchObject({ query: "list", params: { offset: 20 } });
    window.dispatchEvent(new MessageEvent("message", { source: null, data: { type: "view_query_result", id: request.id, ok: true, data: "forged", executedAt: 1 } }));
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_query_result", id: request.id, ok: true, data: { items: [1] }, executedAt: 1700000000000 } }));
    await expect(ok).resolves.toEqual({ data: { items: [1] }, executedAt: 1700000000000 });

    const failed = sdk.query("list");
    const second = posted.filter((message) => message.type === "view_query").pop() as { id: string };
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_query_result", id: second.id, ok: false, error: "view_query_failed" } }));
    await expect(failed).rejects.toThrow("view_query_failed");
  } finally {
    window.postMessage = original;
  }
});


test("frozen legacy templates retain onData and raw query results alongside the new SDK", async () => {
  const posted: Array<Record<string, unknown>> = [];
  const original = window.postMessage;
  window.postMessage = ((message: Record<string, unknown>) => { posted.push(message); }) as typeof window.postMessage;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => { callback(0); return 1; }) as typeof window.requestAnimationFrame;
  try {
    new Function(VIEW_DISPLAY_SDK)();
    type SDK = { onData: (fn: (payload: unknown) => void) => void; query: (name: string, params?: Record<string, unknown>) => Promise<unknown>; resize: () => void };
    const { zenmindView: legacy, viewHost: modern } = window as unknown as { zenmindView: SDK; viewHost: SDK };
    const received: unknown[] = [];
    legacy.onData(payload => received.push(payload));
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_init", data: { view, payload: { items: ["saved"] } } } }));
    expect(received).toEqual([{ items: ["saved"] }]);
    const oldResult = legacy.query("list", { offset: 0 });
    const newResult = modern.query("list", { offset: 20 });
    const requests = posted.filter(message => message.type === "view_query");
    for (const [index, request] of requests.entries()) {
      window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_query_result", id: request.id, ok: true, data: { items: [index] }, executedAt: 1700000000000 } }));
    }
    await expect(oldResult).resolves.toEqual({ items: [0] });
    await expect(newResult).resolves.toEqual({ data: { items: [1] }, executedAt: 1700000000000 });
    const failure = legacy.query("list");
    const request = posted.filter(message => message.type === "view_query").at(-1)!;
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_query_result", id: request.id, ok: false, error: "connector_auth_required" } }));
    await expect(failure).rejects.toThrow("connector_auth_required");
    expect(legacy.resize).toBe(modern.resize);
  } finally { window.postMessage = original; }
});

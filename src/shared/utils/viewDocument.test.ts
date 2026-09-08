/** @jest-environment jsdom */
import { viewDocumentHTML } from "./viewDocument";
const view = { connectorId: "forms", key: "edit", renderer: "html" as const };
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
  expect(doc.querySelector("script")?.getAttribute("src")).toMatch(/^data:text\/javascript;base64,/);
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

/** @jest-environment jsdom */
import { buildHtmlPreviewDocument, htmlPreviewCsp, isCompleteHtmlDocument } from "./htmlPreviewDocument";
import { resolveHtmlVisualizationAssets } from "@/shared/utils/htmlVisualizationAssets";

const origin = "https://webclient.example/chat/1";

it("replaces document policies and base URLs with the host policy before any script", () => {
  const source = '<!doctype html><html><head><base href="https://remote.example/"><meta http-equiv="refresh" content="0;url=https://remote.example/"><meta http-equiv="Content-Security-Policy" content="default-src *"><script src="/assets/visualization/mermaid.min.js"></script></head><body><script>window.marker=1</script></body></html>';
  const result = buildHtmlPreviewDocument(source, "token", origin)!;
  const parsed = new DOMParser().parseFromString(result, "text/html");
  expect(parsed.querySelector("base")).toBeNull();
  expect(parsed.querySelectorAll("meta[http-equiv]")).toHaveLength(1);
  expect(parsed.head.firstElementChild?.getAttribute("content")).toBe(htmlPreviewCsp(origin));
  expect(result).toContain('src="https://webclient.example/assets/visualization/mermaid.min.js"');
  expect(result).toContain("window.marker=1");
  expect(htmlPreviewCsp(origin)).toContain("'unsafe-inline'");
  expect(htmlPreviewCsp(origin)).toContain("connect-src 'none'");
  expect(htmlPreviewCsp(origin)).not.toContain("'self'");
});

it("declines unsupported origins without throwing or parsing HTML", () => {
  const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
  try {
    for (const url of ["file:///tmp/message.html", "about:blank", "bad URL"]) {
      expect(htmlPreviewCsp(url)).toBeNull();
      expect(buildHtmlPreviewDocument("<html></html>", "token", url)).toBeNull();
    }
    expect(parse).not.toHaveBeenCalled();
  } finally { parse.mockRestore(); }
});

it("parses a document with built-in resources only once", () => {
  const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
  try {
    const result = buildHtmlPreviewDocument('<html><script src="/assets/visualization/mermaid.min.js"></script></html>', "token", origin)!;
    expect(parse).toHaveBeenCalledTimes(1);
    expect(result).toContain("https://webclient.example/assets/visualization/mermaid.min.js");
  } finally { parse.mockRestore(); }
});

it("preserves absence of doctype when resolving built-in assets and injecting a preview", () => {
  const source = '<html><head><script src="/assets/visualization/echarts.min.js"></script></head><body>legacy layout</body></html>';
  expect(resolveHtmlVisualizationAssets(source, origin)).not.toMatch(/^<!doctype/iu);
  expect(buildHtmlPreviewDocument(source, "token", origin)).not.toMatch(/^<!doctype/iu);
  expect(buildHtmlPreviewDocument(`<!doctype html>${source}`, "token", origin)).toMatch(/^<!DOCTYPE html>/u);
});

it("identifies complete documents without treating ordinary fragments or quoted examples as documents", () => {
  expect(isCompleteHtmlDocument('<!-- note -->\n<!DOCTYPE html><html></html>')).toBe(true);
  expect(isCompleteHtmlDocument('<html lang="zh-CN"></html>')).toBe(true);
  expect(isCompleteHtmlDocument('<section><pre>&lt;html&gt;</pre></section>')).toBe(false);
});

/** @jest-environment jsdom */
import { mermaidSvgWithStyleNonce } from "./MarkdownMermaid";

it("attaches the host style nonce only to generated SVG styles", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style>.node{fill:red}</style><g class="node"><text>A</text></g></svg>';
  expect(mermaidSvgWithStyleNonce(svg)).toBe(svg);
  const output = new DOMParser().parseFromString(mermaidSvgWithStyleNonce(svg, "host-nonce"), "image/svg+xml");
  expect(output.querySelector("style")?.getAttribute("nonce")).toBe("host-nonce");
  expect(output.querySelector("style")?.textContent).toBe(".node{fill:red}");
  expect(output.querySelector("g")?.hasAttribute("nonce")).toBe(false);
  expect(output.querySelector("text")?.textContent).toBe("A");
});

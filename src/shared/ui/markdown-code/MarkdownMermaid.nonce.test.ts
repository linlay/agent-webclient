/** @jest-environment jsdom */
import { mermaidSvgWithStyleNonce } from "./MarkdownMermaid";

it("attaches the host style nonce only to generated SVG styles", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style>.node{fill:red}</style><g class="node"><text>A</text></g></svg>';
  expect(mermaidSvgWithStyleNonce(svg)).toBe(svg);
  const output = document.createElement("template");
  output.innerHTML = mermaidSvgWithStyleNonce(svg, "host-nonce");
  const content = output.content;
  expect(content.querySelector("style")?.getAttribute("nonce")).toBe("host-nonce");
  expect(content.querySelector("style")?.textContent).toBe(".node{fill:red}");
  expect(content.querySelector("g")?.hasAttribute("nonce")).toBe(false);
  expect(content.querySelector("text")?.textContent).toBe("A");
});

it.each(["<br>", "<br/>"])("preserves all foreignObject labels containing %s", (br) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><style>.node{fill:red}</style><g class="node"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><p>one${br}two</p></div></foreignObject></g><g class="node"><text>last</text></g></svg>`;
  const template = document.createElement("template");
  template.innerHTML = mermaidSvgWithStyleNonce(svg, "nonce");
  expect(template.content.querySelectorAll(".node")).toHaveLength(2);
  expect(template.content.querySelector("parsererror")).toBeNull();
  expect(template.content.querySelector("p")?.textContent).toBe("onetwo");
  expect(template.content.querySelector("text")?.textContent).toBe("last");
  expect(template.content.querySelector("style")?.getAttribute("nonce")).toBe("nonce");
});

it.each(["<div>error</div>", "<svg></svg><div>unexpected</div>", ""])("rejects invalid SVG structure: %s", (output) => {
  expect(() => mermaidSvgWithStyleNonce(output, "nonce")).toThrow("Invalid Mermaid SVG");
  expect(() => mermaidSvgWithStyleNonce(output)).toThrow("Invalid Mermaid SVG");
});

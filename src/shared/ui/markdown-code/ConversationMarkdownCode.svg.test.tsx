/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationMarkdown } from "../ConversationMarkdown";
import { ConversationMarkdownCode, type ConversationMarkdownCodeProps } from "./ConversationMarkdownCode";

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#123">侧边栏 100%</text></svg>';
const fence = "```svg\n";

describe("SVG previews in Markdown code blocks", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const copyCode = jest.fn().mockResolvedValue(undefined);
  const Code = (props: ConversationMarkdownCodeProps) => <ConversationMarkdownCode {...props} copyCode={copyCode} />;
  const render = (content: string, isStreaming = false) => act(async () => {
    root.render(<ConversationMarkdown content={content} isStreaming={isStreaming} codeComponent={Code} />);
  });
  const sourceToggle = () => host.querySelector<HTMLElement>("[aria-expanded]")!;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    copyCode.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("previews a closed fence after image load and preserves source copying", async () => {
    await render(`${fence}${svg}`, true);
    expect(host.querySelector("img")).toBeNull();
    expect(sourceToggle().getAttribute("aria-expanded")).toBe("true");

    await render(`${fence}${svg}\n\`\`\`\n\n后续正文`, true);
    const image = host.querySelector("img")!;
    expect(image.hidden).toBe(true);
    expect(sourceToggle().getAttribute("aria-expanded")).toBe("true");
    expect(image.src).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`${svg}\n`)}`);

    act(() => image.dispatchEvent(new Event("load")));
    expect(image.hidden).toBe(false);
    expect(sourceToggle().getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).toContain("后续正文");

    act(() => sourceToggle().click());
    expect(sourceToggle().getAttribute("aria-expanded")).toBe("true");
    const copyButton = host.querySelector('[data-material-icon="content_copy"]')!.closest("button")!;
    await act(async () => copyButton.click());
    expect(copyCode).toHaveBeenCalledWith(`${svg}\n`);
  });

  it("keeps source expanded when the browser rejects a replacement image", async () => {
    await render(`${fence}${svg}\n\`\`\``);
    const previousImage = host.querySelector("img")!;
    act(() => previousImage.dispatchEvent(new Event("load")));
    expect(sourceToggle().getAttribute("aria-expanded")).toBe("false");

    await render(`${fence}<svg\n\`\`\`\n\n后续正文`);
    const image = host.querySelector("img")!;
    expect(image).not.toBe(previousImage);
    expect(image.hidden).toBe(true);
    act(() => image.dispatchEvent(new Event("error")));

    expect(host.querySelector("img")).toBeNull();
    expect(sourceToggle().getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("code")?.textContent).toContain("<svg");
    expect(host.textContent).toContain("后续正文");
  });
});

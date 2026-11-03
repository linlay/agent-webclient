import { removeEmptyMarkdownTables } from "@/shared/ui/markdownPreprocess";
import { parseWorkspaceFileHref } from "@/shared/ui/markdownWorkspaceLinks";
import {
  parseMarkdownWebHref,
  shouldOpenWebLinkInSidebar,
} from "@/shared/ui/markdownWebLinks";
import { sanitizeMarkdownImageProps } from "@/shared/ui/markdownImageProps";
import {
  getMarkdownAudioMimeType,
  getMarkdownVideoMimeType,
  isMarkdownAudioSource,
  isMarkdownVideoSource,
} from "@/shared/ui/markdownMedia";

describe("sanitizeMarkdownImageProps", () => {
  it("removes void-element and renderer-only props before rendering img", () => {
    expect(
      sanitizeMarkdownImageProps({
        src: "chat_1/image.png",
        alt: "preview",
        class: "legacy-class",
        classname: "legacy-classname",
        className: "image",
        children: [],
        dangerouslySetInnerHTML: { __html: "unsafe" },
        domNode: { name: "img" },
        streamStatus: "done",
        loading: "lazy",
      }),
    ).toEqual({
      src: "chat_1/image.png",
      alt: "preview",
      className: "image",
      loading: "lazy",
    });
  });
});

describe("isMarkdownVideoSource", () => {
  it.each([
    "artifacts/run_01/demo.mp4",
    "artifacts/run_01/demo.WEBM",
    "https://cdn.example.com/demo.mov?token=demo#preview",
    "artifacts/run_01/%E5%8E%A8%E6%88%BF%20%E5%B0%8F%E7%8B%97.m4v",
  ])("recognizes a supported Markdown video resource: %s", (source) => {
    expect(isMarkdownVideoSource(source)).toBe(true);
  });

  it.each([
    "artifacts/run_01/demo.png",
    "artifacts/run_01/demo.mp4.png",
    "artifacts/run_01/video",
    "data:image/png;base64,AAAA",
    "blob:https://example.com/id",
    "artifacts/run_01/demo.%ZZmp4",
  ])("keeps a non-video Markdown resource as an image: %s", (source) => {
    expect(isMarkdownVideoSource(source)).toBe(false);
  });

  it.each([
    ["demo.mp4", "video/mp4"],
    ["demo.mov", "video/quicktime"],
    ["demo.mpg", "video/mpeg"],
    ["demo.ogv", "video/ogg"],
    ["demo.webm", "video/webm"],
    ["demo.png", ""],
  ])("infers the video MIME fallback for %s", (source, expected) => {
    expect(getMarkdownVideoMimeType(source)).toBe(expected);
  });
});

describe("isMarkdownAudioSource", () => {
  it.each([
    "artifacts/run_01/voice.mp3",
    "artifacts/run_01/voice.WAV",
    "https://cdn.example.com/voice.ogg?token=demo#preview",
    "artifacts/run_01/%E5%A5%B3%E5%A3%B0.m4a",
  ])("recognizes a supported Markdown audio resource: %s", (source) => {
    expect(isMarkdownAudioSource(source)).toBe(true);
  });

  it.each([
    "artifacts/run_01/demo.png",
    "artifacts/run_01/demo.mp4",
    "artifacts/run_01/voice.mp3.png",
    "artifacts/run_01/audio",
    "data:audio/mpeg;base64,AAAA",
  ])("keeps a non-audio Markdown resource out of the audio player: %s", (source) => {
    expect(isMarkdownAudioSource(source)).toBe(false);
  });

  it.each([
    ["voice.mp3", "audio/mpeg"],
    ["voice.wav", "audio/wav"],
    ["voice.m4a", "audio/mp4"],
    ["voice.png", ""],
  ])("infers the audio MIME fallback for %s", (source, expected) => {
    expect(getMarkdownAudioMimeType(source)).toBe(expected);
  });
});

describe("removeEmptyMarkdownTables", () => {
  it("removes a markdown table that only has an Issues header row", () => {
    const markdown = ["Before", "", "| Issues |", "| --- |", "", "After"].join(
      "\n",
    );

    expect(removeEmptyMarkdownTables(markdown)).toBe(
      ["Before", "", "", "After"].join("\n"),
    );
  });

  it("keeps markdown tables with body rows", () => {
    const markdown = [
      "| Issues |",
      "| --- |",
      "| Missing status |",
      "",
      "After",
    ].join("\n");

    expect(removeEmptyMarkdownTables(markdown)).toBe(markdown);
  });

  it("keeps table-like text inside fenced code blocks", () => {
    const markdown = ["```md", "| Issues |", "| --- |", "```"].join("\n");

    expect(removeEmptyMarkdownTables(markdown)).toBe(markdown);
  });
});

describe("parseWorkspaceFileHref", () => {
  it("parses absolute file paths with line numbers", () => {
    expect(
      parseWorkspaceFileHref("/Users/demo/project/src/a.ts:12"),
    ).toEqual({
      href: "/Users/demo/project/src/a.ts:12",
      filePath: "/Users/demo/project/src/a.ts",
      line: 12,
    });
  });

  it("parses @workspace/ paths literally as project-relative files", () => {
    expect(parseWorkspaceFileHref("@workspace/docs/说明 1.md:42:3")).toEqual({
      href: "@workspace/docs/说明 1.md:42:3",
      filePath: "docs/说明 1.md",
      line: 42,
    });
    // Nothing is decoded: this file is really named "a%20b.md".
    expect(parseWorkspaceFileHref("@workspace/a%20b.md")).toEqual({
      href: "@workspace/a%20b.md",
      filePath: "a%20b.md",
    });
    expect(parseWorkspaceFileHref("@Workspace/Makefile")).toEqual({
      href: "@Workspace/Makefile",
      filePath: "Makefile",
    });
    for (const invalid of ["@workspace/", "@workspace/../secret.txt", "@workspace/a//b.txt", "@chat/a.md"]) {
      expect(parseWorkspaceFileHref(invalid)).toBeNull();
    }
  });

  it.each([
    ["C:\\project\\src\\app.ts:42", "C:\\project\\src\\app.ts", 42],
    ["C:/project/src/app.ts:42", "C:/project/src/app.ts", 42],
    ["file:///Users/demo/project/src/app.ts", "/Users/demo/project/src/app.ts", undefined],
    ["file:///C:/project/src/app.ts", "C:/project/src/app.ts", undefined],
    ["/workspace/chat_123/china-gdp-2010-2024.html", "/workspace/chat_123/china-gdp-2010-2024.html", undefined],
  ])("parses the host path %s for Platform to resolve", (href, filePath, line) => {
    expect(parseWorkspaceFileHref(href)).toEqual({ href, filePath, ...(line ? { line } : {}) });
  });

  it.each([
    "src/features/composer/lib/slashCommands.ts:53",
    "china-gdp-2010-2024.html",
    "outputs/china-gdp-2010-2024.html",
    "reports/季度 报表.xhtml",
    "./Makefile",
    "./AGENTS.md",
    "\\\\server\\share\\a.md",
    "file://server/share/a.md",
  ])("does not guess a project file for %s", (href) => {
    expect(parseWorkspaceFileHref(href)).toBeNull();
  });

  it("does not intercept authenticated resource links", () => {
    expect(parseWorkspaceFileHref("/api/resource?file=src%2Fa.ts")).toBeNull();
  });

  it("does not intercept other api routes or unsafe links", () => {
    expect(parseWorkspaceFileHref("/api/file?path=src%2Fa.ts")).toBeNull();
    expect(parseWorkspaceFileHref("javascript:alert(1)")).toBeNull();
  });

  it("does not intercept external links", () => {
    expect(parseWorkspaceFileHref("https://example.com/src/a.ts:12")).toBeNull();
    expect(parseWorkspaceFileHref("ftp://example.com/report.html")).toBeNull();
    expect(parseWorkspaceFileHref("//example.com/report.html")).toBeNull();
  });

  it("does not intercept unknown relative routes without file extensions", () => {
    expect(parseWorkspaceFileHref("reports/dashboard")).toBeNull();
    expect(parseWorkspaceFileHref("example.com")).toBeNull();
  });
});

describe("parseMarkdownWebHref", () => {
  it.each([
    ["https://www.baidu.com", "https://www.baidu.com/"],
    ["http://example.com/path?q=1#section", "http://example.com/path?q=1#section"],
    ["//example.com/docs", "https://example.com/docs"],
  ])("normalizes supported web links: %s", (href, expected) => {
    expect(parseMarkdownWebHref(href, "https://webclient.test/chat")).toEqual({
      href,
      url: expected,
    });
  });

  it.each([
    "/api/resource?file=report.txt",
    "docs/report.html",
    "#section",
    "mailto:test@example.com",
    "javascript:alert(1)",
    "ftp://example.com/file",
  ])("does not intercept non-web hrefs: %s", (href) => {
    expect(
      parseMarkdownWebHref(href, "https://webclient.test/chat"),
    ).toBeNull();
  });
});

describe("shouldOpenWebLinkInSidebar", () => {
  const plainClick = {
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  it("uses the sidebar for an unmodified primary click", () => {
    expect(shouldOpenWebLinkInSidebar(plainClick)).toBe(true);
  });

  it.each([
    { ...plainClick, button: 1 },
    { ...plainClick, ctrlKey: true },
    { ...plainClick, metaKey: true },
    { ...plainClick, shiftKey: true },
    { ...plainClick, altKey: true },
  ])("preserves native browser activation for %o", (activation) => {
    expect(shouldOpenWebLinkInSidebar(activation)).toBe(false);
  });
});

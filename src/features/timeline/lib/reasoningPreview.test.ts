import { buildReasoningPreviewText } from "@/features/timeline/lib/reasoningPreview";

describe("buildReasoningPreviewText", () => {
  it("returns empty string for empty or whitespace-only text", () => {
    expect(buildReasoningPreviewText("")).toBe("");
    expect(buildReasoningPreviewText("   \n\t ")).toBe("");
  });

  it("collapses newlines and repeated whitespace into single spaces", () => {
    expect(
      buildReasoningPreviewText("  first line\n\n  second\tline\n third "),
    ).toBe("first line second line third");
  });

  it("keeps short text as-is", () => {
    expect(buildReasoningPreviewText("正在分析仓库结构")).toBe(
      "正在分析仓库结构",
    );
  });

  it("keeps the tail and marks the truncated head with an ellipsis", () => {
    const text = `head-${"a".repeat(300)}-tail`;
    const preview = buildReasoningPreviewText(text);
    expect(preview.length).toBe(200);
    expect(preview.startsWith("…")).toBe(true);
    expect(preview.endsWith("-tail")).toBe(true);
    expect(text.endsWith(preview.slice(1))).toBe(true);
  });

  it("trims leading whitespace after the head is dropped", () => {
    const text = `${"a".repeat(300)}   tail`;
    const preview = buildReasoningPreviewText(text);
    expect(preview).toBe(`…${"a".repeat(194)} tail`);
    expect(preview.length).toBe(200);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";

function readLayoutCss(): string {
  return readFileSync(
    path.resolve(__dirname, "globals", "layout.css"),
    "utf8",
  );
}

function extractRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] || "";
}

describe("layout status pill styles", () => {
  it("keeps the top-nav status label on one line in narrow embedded panels", () => {
    const rule = extractRule(readLayoutCss(), ".status-pill");

    expect(rule).toContain("display: inline-flex");
    expect(rule).toContain("align-items: center");
    expect(rule).toContain("flex: 0 0 auto");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("word-break: keep-all");
    expect(rule).toContain("writing-mode: horizontal-tb");
  });
});

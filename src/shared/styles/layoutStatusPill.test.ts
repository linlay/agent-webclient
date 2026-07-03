import fs from "node:fs";
import path from "node:path";
import { resolveStatusPillClassName } from "@/app/layout/TopNav";

describe("layout status pill styles", () => {
  it("keeps the top-nav status label on one line in narrow embedded panels", () => {
    const className = resolveStatusPillClassName("is-idle");

    expect(className).toContain("status-pill");
    expect(className).toContain("is-idle");
    expect(className).toContain("tw:inline-flex");
    expect(className).toContain("tw:items-center");
    expect(className).toContain("tw:flex-none");
    expect(className).toContain("tw:whitespace-nowrap");
    expect(className).toContain("tw:break-keep");
    expect(className).toContain("tw:[writing-mode:horizontal-tb]");
    expect(className).toContain("tw:before:content-['']");
    expect(className).toContain("tw:before:bg-[color-mix");
    expect(className).not.toMatch(/(?:^|\s)(?!tw:)\S+:tw:/);
  });

  it("keeps status-pill as a semantic class without legacy global styling", () => {
    const layoutCss = fs.readFileSync(
      path.join(process.cwd(), "src", "shared", "styles", "globals", "layout.css"),
      "utf8",
    );

    expect(layoutCss).not.toMatch(/\.status-pill\b/);
  });
});

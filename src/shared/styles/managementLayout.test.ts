import fs from "node:fs";
import path from "node:path";

function readStyle(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", "shared", "styles", "globals", relativePath), "utf8");
}

function readRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  const end = css.indexOf("}", start);
  return end < 0 ? "" : css.slice(start, end + 1);
}

describe("management layout contracts", () => {
  it("keeps standalone management consoles at full guest viewport height", () => {
    const workersCss = readStyle("workers.css");
    const pageRule = readRule(workersCss, ".management-page-console");

    expect(pageRule).toMatch(/flex:\s*1 1 auto;/);
    expect(pageRule).toMatch(/height:\s*100%;/);
    expect(pageRule).toMatch(/min-height:\s*0;/);
    expect(pageRule).toMatch(/max-height:\s*none;/);
    expect(pageRule).toMatch(/overflow:\s*hidden;/);
    expect(workersCss).toMatch(/\.automations-console-page,\s*\.registries-page,\s*\.mcp-servers-page\s*\{[\s\S]*?height:\s*100vh;/);
  });

  it("keeps modal and drawer sections capped to the visible viewport", () => {
    const modalCss = readStyle("modal.css");
    const modalRule = readRule(modalCss, ".command-modal-section");

    expect(modalRule).toMatch(/max-height:\s*70vh;/);
    expect(modalRule).not.toMatch(/height:\s*100%;/);
  });
});

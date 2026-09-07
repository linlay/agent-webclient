import fs from "node:fs";
import path from "node:path";

function readStyle(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", "shared", "styles", "globals", relativePath), "utf8");
}

function readFeatureStyle(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", relativePath), "utf8")
    .replace(/:global\(([^)]+)\)/g, "$1");
}

function readManagementStyles(): string {
  return [
    readFeatureStyle("features/command-center/components/CommandSurface.module.css"),
    readFeatureStyle("features/automations/components/AutomationManagement.module.css"),
  ].join("\n");
}

function readRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  const end = css.indexOf("}", start);
  return end < 0 ? "" : css.slice(start, end + 1);
}

describe("management layout contracts", () => {
  it("shares icon, control, and form spacing tokens across management pages", () => {
    const baseCss = readStyle("base.css");

    expect(baseCss).toMatch(/--ui-icon-size-sm:\s*16px;/);
    expect(baseCss).toMatch(/--ui-icon-hit-size-sm:\s*24px;/);
    expect(baseCss).toMatch(/--ui-control-height-mini:\s*24px;/);
    expect(baseCss).toMatch(/--ui-control-height-sm:\s*32px;/);
    expect(baseCss).toMatch(/--ui-control-height-md:\s*36px;/);
    expect(baseCss).toMatch(/--ui-form-gap:\s*12px;/);
    expect(readRule(baseCss, ".ui-icon-hover-24")).toMatch(
      /var\(--ui-icon-hit-size-sm\)/,
    );
  });

  it("keeps standalone management consoles at full guest viewport height", () => {
    const workersCss = readFeatureStyle("app/layout/ManagementPages.module.css");
    const pageRule = readRule(workersCss, ".management-page-console");

    expect(pageRule).toMatch(/flex:\s*1 1 auto;/);
    expect(pageRule).toMatch(/height:\s*100%;/);
    expect(pageRule).toMatch(/min-height:\s*0;/);
    expect(pageRule).toMatch(/max-height:\s*none;/);
    expect(pageRule).toMatch(/overflow:\s*hidden;/);
    expect(workersCss).toMatch(/\.automations-console-page,\s*\.registries-page,\s*\.connectors-page\s*\{[\s\S]*?height:\s*100vh;/);
  });

  it("lets modal and drawer sections fill the fixed command card height", () => {
    const modalCss = readManagementStyles();
    const modalRule = readRule(modalCss, ".command-modal-section");

    expect(modalRule).toMatch(/height:\s*100%;/);
    expect(modalRule).not.toMatch(/max-height:\s*70vh;/);
  });

  it("keeps management dialogs stable while source editors fill the available height", () => {
    const modalCss = readManagementStyles();
    const copilotCss = readFeatureStyle("app/layout/CopilotLayout.module.css");
    const bodyRule = readRule(
      modalCss,
      ".command-modal.is-automation-console .ant-modal-body",
    );
    const cardRule = readRule(
      modalCss,
      ".command-modal.is-automation-console .command-modal-card.is-automation-console",
    );
    const sectionRule = readRule(
      modalCss,
      ".command-modal-card.is-automation-console>.command-modal-section",
    );
    const sourceDetailRule = readRule(
      modalCss,
      ".automation-console-detail.is-source-editor",
    );
    const sourceWorkspaceRule = readRule(
      modalCss,
      ".automation-source-workspace",
    );
    const sourceEditorRule = readRule(
      modalCss,
      ".automation-source-editor.ant-input",
    );
    const drawerBodyRule = readRule(
      copilotCss,
      ".copilot-drawer.is-automation-console .ant-drawer-body",
    );
    const drawerCardRule = readRule(
      copilotCss,
      ".copilot-drawer.is-automation-console .command-modal-card.is-automation-console",
    );

    expect(bodyRule).toMatch(/height:\s*min\(76vh,\s*720px\);/);
    expect(bodyRule).toMatch(/overflow:\s*hidden;/);
    expect(cardRule).toMatch(/height:\s*100%;/);
    expect(cardRule).toMatch(/min-height:\s*0;/);
    expect(sectionRule).toMatch(/flex:\s*1 1 auto;/);
    expect(sectionRule).toMatch(/min-height:\s*0;/);
    expect(sourceDetailRule).toMatch(/display:\s*flex;/);
    expect(sourceDetailRule).toMatch(/overflow:\s*hidden;/);
    expect(sourceWorkspaceRule).toMatch(/flex:\s*1 1 auto;/);
    expect(sourceWorkspaceRule).toMatch(/min-height:\s*0;/);
    expect(sourceEditorRule).toMatch(/flex:\s*1 1 auto;/);
    expect(sourceEditorRule).toMatch(/min-height:\s*0;/);
    expect(sourceEditorRule).toMatch(/resize:\s*none;/);
    expect(drawerBodyRule).toMatch(/display:\s*flex;/);
    expect(drawerBodyRule).toMatch(/min-height:\s*0;/);
    expect(drawerBodyRule).toMatch(/overflow:\s*hidden;/);
    expect(drawerCardRule).toMatch(/height:\s*100%;/);
    expect(drawerCardRule).toMatch(/min-height:\s*0;/);
    expect(drawerCardRule).toMatch(/max-height:\s*none;/);
  });

  it("keeps the worker history dialog height stable and scrolls its list", () => {
    const workersCss = readFeatureStyle(
      "features/workers/components/WorkerNavigator.module.css",
    );
    const bodyRule = readRule(workersCss, ".worker-history-modal .ant-modal-body");
    const sectionRule = readRule(
      workersCss,
      ".worker-history-modal .command-modal-section",
    );
    const listRule = readRule(
      workersCss,
      ".worker-history-modal .history-list-container",
    );

    expect(bodyRule).toMatch(/height:\s*min\(70vh,\s*600px\);/);
    expect(bodyRule).toMatch(/overflow:\s*hidden;/);
    expect(sectionRule).toMatch(/height:\s*100%;/);
    expect(sectionRule).toMatch(/min-height:\s*0;/);
    expect(listRule).toMatch(/flex:\s*1 1 auto;/);
    expect(listRule).toMatch(/min-height:\s*0;/);
  });
});

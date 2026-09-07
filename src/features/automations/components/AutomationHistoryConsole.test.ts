import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("AutomationHistoryConsole architecture", () => {
  const consoleSource = readSource(
    "src/features/automations/components/AutomationHistoryConsole.tsx",
  );
  const historySource = readSource(
    "src/features/automations/components/AutomationExecutionHistory.tsx",
  );
  const runtimeSource = readSource(
    "src/features/automations/hooks/useAutomationHistoryRuntime.ts",
  );

  it("keeps the console as feature composition without direct data access", () => {
    expect(consoleSource).toContain("<AutomationListPane");
    expect(consoleSource).toContain("<AutomationExecutionHistory");
    expect(consoleSource).toContain("<AutomationEditorDrawer");
    expect(consoleSource).toContain("<AutomationExecutionDrawer");
    expect(consoleSource).not.toContain('from "@/shared/data"');
  });

  it("owns list, pagination, push refresh and CRUD in the domain runtime", () => {
    expect(runtimeSource).toContain("getAutomations");
    expect(runtimeSource).toContain("getAutomationExecutions");
    expect(runtimeSource).toContain("mergeAutomationExecutionPages");
    expect(runtimeSource).toContain('types: [');
    expect(runtimeSource).toContain('"automation.execution.completed"');
    expect(runtimeSource).toContain("toggleAutomation");
    expect(runtimeSource).toContain("createAutomation");
    expect(runtimeSource).toContain("deleteAutomation");
    expect(runtimeSource).toContain("triggerAutomation");
  });

  it("guards late list/detail responses and debounces viewer refresh", () => {
    expect(runtimeSource).toContain("request !== listRequestRef.current");
    expect(runtimeSource).toContain("request !== executionRequestRef.current");
    expect(runtimeSource).toContain(
      "executionId === viewerExecutionRef.current?.id",
    );
    expect(runtimeSource).toContain(
      "setViewerRefreshRevision((revision) => revision + 1)",
    );
  });

  it("keeps Run now in the detail menu and exposes one local view action", () => {
    expect(historySource).toContain('key: "trigger"');
    expect(historySource).toContain("automationConsole.action.triggerNow");
    expect(historySource).toContain("selectedTriggering");
    expect(historySource).toContain(
      'item.hasResult || Boolean(String(item.chatId || "").trim())',
    );
    expect(historySource).toContain("automationHistory.action.view");
    expect(historySource).not.toContain("useNavigate");
  });
});

describe("Automation execution viewer contracts", () => {
  const drawerSource = readSource(
    "src/features/automations/components/AutomationExecutionDrawer.tsx",
  );
  const drawerStyles = readSource(
    "src/features/automations/components/AutomationExecutionDrawer.module.css",
  );

  it("opens a local right drawer and keeps the detail/chat split", () => {
    expect(drawerSource).toContain("<Drawer");
    expect(drawerSource).toContain('placement="right"');
    expect(drawerSource).not.toContain("useNavigate");
    expect(drawerStyles).toContain(
      "grid-template-columns: 280px minmax(0, 1fr)",
    );
    expect(drawerSource.indexOf("{executionPanel}")).toBeLessThan(
      drawerSource.indexOf("{chatPanel}"),
    );
  });
});

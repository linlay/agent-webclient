import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Automation Run now contracts", () => {
  const consoleSource = readSource(
    "src/app/pages/automations/AutomationHistoryConsole.tsx",
  );

  it("places Run now in the selected detail More settings menu", () => {
    const menuStart = consoleSource.indexOf("const moreSettingsMenu");
    const itemStart = consoleSource.indexOf("const renderAutomationItem");
    const menuSource = consoleSource.slice(menuStart, itemStart);
    const itemSource = consoleSource.slice(itemStart, consoleSource.indexOf("\n  return (", itemStart));

    expect(menuSource).toContain('key: "trigger"');
    expect(menuSource).toContain("automationConsole.action.triggerNow");
    expect(menuSource).toContain("triggerAutomationItem(selected)");
    expect(menuSource).toContain("disabled: selectedTriggering");
    expect(itemSource).not.toContain("triggerAutomationItem");
    expect(itemSource).not.toContain("triggerButton");
    expect(consoleSource).toContain("enabledAutomations.map(renderAutomationItem)");
    expect(consoleSource).toContain("disabledAutomations.map(renderAutomationItem)");
  });

  it("tracks menu trigger loading by Automation ID", () => {
    expect(consoleSource).toContain("const [triggeringIds, setTriggeringIds]");
    expect(consoleSource).toContain("triggeringIdsRef.current.has(item.id)");
    expect(consoleSource).toContain("triggeringIdsRef.current.add(item.id)");
    expect(consoleSource).toContain("triggeringIdsRef.current.delete(item.id)");
    expect(consoleSource).toContain("triggeringIds.has(selected.id)");
    expect(consoleSource).toContain('name={selectedTriggering ? "progress_activity" : "bolt"}');
  });


describe("Automation execution viewer contracts", () => {
  const consoleSource = readSource(
    "src/app/pages/automations/AutomationHistoryConsole.tsx",
  );
  const drawerSource = readSource(
    "src/features/automations/components/AutomationExecutionDrawer.tsx",
  );
  const drawerStyles = readSource(
    "src/features/automations/components/AutomationExecutionDrawer.module.css",
  );
  const timelineSource = readSource(
    "src/features/conversation/components/ReadOnlyConversationTimeline.tsx",
  );
  const timelineStyles = readSource(
    "src/features/conversation/components/ReadOnlyConversationTimeline.module.css",
  );

  it("exposes one in-page view action for executions with a result or chat", () => {
    expect(consoleSource).toContain(
      'item.hasResult || Boolean(String(item.chatId || "").trim())',
    );
    expect(consoleSource.match(/automationHistory\.action\.view\b/g)).toHaveLength(2);
    expect(consoleSource).not.toContain("automationHistory.action.viewResult");
    expect(consoleSource).not.toContain("automationHistory.action.openConversation");
    expect(consoleSource).not.toContain("查看完整结果");
    expect(consoleSource).not.toContain("打开对话");
  });

  it("opens a local drawer without a navigation escape hatch", () => {
    expect(consoleSource).toContain("<AutomationExecutionDrawer");
    expect(drawerSource).toContain("<Drawer");
    expect(drawerSource).toContain('placement="right"');
    expect(drawerSource).not.toContain("<Modal");
    for (const source of [consoleSource, drawerSource, timelineSource]) {
      expect(source).not.toContain("useNavigate");
      expect(source).not.toContain("buildSurfaceRoute");
      expect(source).not.toContain("onNavigateAway");
      expect(source).not.toContain("startQuery");
      expect(source).not.toContain(".attach(");
      expect(source).not.toContain(".detach(");
    }
  });

  it("keeps execution detail at 280px and gives the chat the remaining width", () => {
    expect(drawerStyles).toContain(
      "grid-template-columns: 280px minmax(0, 1fr)",
    );
    expect(drawerSource.indexOf("{executionPanel}")).toBeLessThan(
      drawerSource.indexOf("{chatPanel}"),
    );
  });

  it("keeps the full chat presentation independent from the viewed execution", () => {
    expect(drawerSource).not.toContain("targetRunId");
    expect(timelineSource).not.toContain("scrollToIndex");
    expect(timelineSource).not.toContain("data-current-execution");
    expect(timelineStyles).not.toContain(".currentRun");
    expect(timelineStyles).not.toContain(".currentRunLabel");
  });

  it("debounces snapshot refreshes for the currently viewed execution", () => {
    expect(consoleSource).toContain(
      "executionId === viewerExecutionRef.current?.id",
    );
    expect(consoleSource).toContain(
      "setViewerRefreshRevision((revision) => revision + 1)",
    );
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(fileName: string): string {
  return readFileSync(join(__dirname, fileName), "utf8");
}

describe("independent conversation surface layout contracts", () => {
  it("keeps Agent free of embedded right sidebar and terminal dock", () => {
    expect(source("AgentChatShell.tsx")).not.toMatch(/RightSidebar|TerminalDock/);
  });

  it("keeps Copilot free of embedded panels, BTW and terminal dock", () => {
    expect(source("CopilotShell.tsx")).not.toMatch(
      /RightSidebar|DebugDrawer|SidePanel|BtwProvider|TerminalDock/,
    );
  });
});

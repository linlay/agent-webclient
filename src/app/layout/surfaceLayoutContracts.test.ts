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

  it("reserves top-bar actions space for the Desktop native Copilot close button", () => {
    const copilotStyles = readFileSync(
      join(__dirname, "CopilotLayout.module.css"),
      "utf8",
    );

    expect(copilotStyles).toMatch(
      /:global\(\.layout-copilot\):global\(\.is-desktop-copilot-host\) :global\(\.copilot-topbar-actions\)\s*\{[\s\S]*?margin-right:\s*30px;/,
    );
  });

  it("centers the mobile top-bar title through symmetric side slots", () => {
    const mobileStyles = readFileSync(
      join(__dirname, "MobileLayout.module.css"),
      "utf8",
    );
    const railWidth = /:global\(\.nav-left\)\s*\{[^}]*width:\s*(\d+)px/.exec(mobileStyles)?.[1];
    const actionsWidth =
      /:global\(\.mobile-topbar-actions\)\s*\{[^}]*width:\s*(\d+)px/.exec(mobileStyles)?.[1];

    expect(railWidth).toBeDefined();
    expect(actionsWidth).toBe(railWidth);
    expect(mobileStyles).toMatch(
      /:global\(\.mobile-topbar-actions\)\s*\{[^}]*justify-content:\s*flex-end;/,
    );
  });

  it("makes the whole app shell the file drop surface on route shells", () => {
    // Neither route shell has a conversation column, so the composer hint and
    // the drop receiver live on the shell root instead of only the composer.
    for (const fileName of ["AgentChatShell.tsx", "CopilotShell.tsx"]) {
      const shell = source(fileName);
      expect(shell).toMatch(/useConversationFileDropTarget\(\)/);
      expect(shell).toMatch(/data-file-drop-surface=/);
      expect(shell).toMatch(/\{\.\.\.fileDrop\.handlers\}/);
    }
  });
});

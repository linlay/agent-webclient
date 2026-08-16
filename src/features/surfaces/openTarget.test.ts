import { buildStandaloneOpenTargetUrl } from "@/features/surfaces/openTarget";

describe("buildStandaloneOpenTargetUrl", () => {
  it("builds controlled read-only and terminal routes", () => {
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "overview",
      chatId: "chat/a",
      agentKey: "agent-1",
    }, "?lang=en&theme=light&runId=stale&desktopAuthContext=secret")).toBe(
      "/overview/agent-1?lang=en&theme=light&chatId=chat%2Fa",
    );
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "terminal",
      agentKey: "agent-1",
    })).toBe("/terminal?agentKey=agent-1&terminalKey=main");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "planning",
      chatId: "chat-1",
      agentKey: "agent-1",
      nodeId: "planning-1",
      label: "Plan",
    })).toBe("/overview/agent-1?chatId=chat-1&view=planning&nodeId=planning-1&label=Plan");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "artifact",
      chatId: "chat-1",
      agentKey: "agent-1",
      preview: {
        name: "report.pdf",
        url: "/api/resource?file=report.pdf",
        downloadUrl: "/api/resource?file=report.pdf&download=1",
        kind: "pdf",
      },
    })).toContain("/overview/agent-1?chatId=chat-1&view=artifact&name=report.pdf");
  });

  it("requires chatId and agentKey for their respective surfaces", () => {
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "debug", chatId: "", agentKey: "agent-1" })).toBe("");
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "debug", chatId: "chat-1" })).toBe("");
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "terminal", agentKey: "" })).toBe("");
  });

  it("allows only absolute HTTP(S) web targets", () => {
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "https://example.com/path",
    })).toBe("https://example.com/path");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "javascript:alert(1)",
    })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "/relative",
    })).toBe("");
  });
});

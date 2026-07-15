import { buildAgentCopyInfoGroups } from "@/features/workers/lib/agentCopyInfo";

const t = (key: string) => key;

describe("buildAgentCopyInfoGroups", () => {
  it("uses menu summary as fallback and maps full agent details", () => {
    const groups = buildAgentCopyInfoGroups({
      summary: {
        agentKey: "agent-a",
        name: "Fallback name",
        type: "coder",
        workspaceDir: "/workspace/fallback",
      },
      detail: {
        key: "agent-a",
        name: "Agent A",
        description: "Builds software",
        workspaceDir: "/workspace/agent-a",
        model: "gpt-5",
        mode: "CODER",
        tools: ["shell", "search"],
        skills: ["frontend"],
        greetings: ["Hello"],
        wonders: ["Can you help?"],
        controls: [],
        meta: { owner: "platform" },
        definition: { mode: "CODER" },
        soulPrompt: "Be precise",
        source: {
          kind: "filesystem",
          path: "/agents/agent-a.json",
          agentDir: "/agents/agent-a",
        },
      },
      t,
    });

    const rows = groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.key === "id")?.copyValue).toBe("agent-a");
    expect(rows.find((row) => row.key === "description")?.copyValue).toBe("Builds software");
    expect(rows.find((row) => row.key === "workspaceDir")?.copyValue).toBe("/workspace/agent-a");
    expect(rows.find((row) => row.key === "tools")?.copyValue).toBe("shell, search");
    expect(rows.find((row) => row.key === "greetings")).toBeUndefined();
    expect(rows.find((row) => row.key === "wonders")).toBeUndefined();
    expect(groups.map((group) => group.key)).toEqual(["basic", "config"]);
  });

  it("keeps required fallback identity and omits unavailable fields", () => {
    const groups = buildAgentCopyInfoGroups({
      summary: { agentKey: "agent-b", name: "Agent B" },
      t,
    });
    const rows = groups.flatMap((group) => group.rows);

    expect(rows.map((row) => row.key)).toEqual(["id", "name"]);
  });
});

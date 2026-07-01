import { terminalBusyAgentKeysFromSessions } from "@/features/terminal/hooks/useActiveTerminalAgents";

describe("terminalBusyAgentKeysFromSessions", () => {
  it("includes only agents with busy terminal sessions", () => {
    const agentKeys = terminalBusyAgentKeysFromSessions([
      {
        terminalId: "term-idle",
        agentKey: "agent-idle",
        terminalKey: "main",
        status: "idle",
      },
      {
        terminalId: "term-busy",
        agentKey: "agent-busy",
        terminalKey: "main",
        status: "busy",
      },
      {
        terminalId: "term-legacy",
        agentKey: "agent-legacy",
        terminalKey: "main",
      },
    ]);

    expect([...agentKeys]).toEqual(["agent-busy"]);
  });
});

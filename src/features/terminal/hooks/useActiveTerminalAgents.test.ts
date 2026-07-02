import {
  terminalAgentKeysFromStatusEvent,
  terminalAgentStatusesFromStatusEvent,
  terminalBusyAgentKeysFromStatusEvent,
  terminalStatusSessionsFromEvent,
  type TerminalStatusEventLike,
} from "@/features/terminal/hooks/useActiveTerminalAgents";

describe("terminal status activity", () => {
  it("tracks every agent with a terminal and marks busy agents separately", () => {
    const event = {
      type: "terminal.status",
      sessions: [
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
      ],
    } satisfies TerminalStatusEventLike;

    const agentStatuses = terminalAgentStatusesFromStatusEvent(event);
    const terminalAgentKeys = terminalAgentKeysFromStatusEvent(event);
    const busyAgentKeys = terminalBusyAgentKeysFromStatusEvent(event);

    expect([...agentStatuses]).toEqual([
      ["agent-idle", "idle"],
      ["agent-busy", "busy"],
      ["agent-legacy", "idle"],
    ]);
    expect([...terminalAgentKeys]).toEqual([
      "agent-idle",
      "agent-busy",
      "agent-legacy",
    ]);
    expect([...busyAgentKeys]).toEqual(["agent-busy"]);
  });

  it("keeps an agent busy when any of its terminal sessions is busy", () => {
    const event = {
      type: "terminal.status",
      sessions: [
        {
          terminalId: "term-busy",
          agentKey: "agent-a",
          terminalKey: "main",
          status: "busy",
        },
        {
          terminalId: "term-idle",
          agentKey: "agent-a",
          terminalKey: "second",
          status: "idle",
        },
      ],
    } satisfies TerminalStatusEventLike;

    const agentStatuses = terminalAgentStatusesFromStatusEvent(event);

    expect([...agentStatuses]).toEqual([["agent-a", "busy"]]);
  });

  it("ignores non-status websocket events", () => {
    const event = {
      type: "terminal.output",
      sessions: [
        {
          terminalId: "term-busy",
          agentKey: "agent-busy",
          terminalKey: "main",
          status: "busy",
        },
      ],
    } satisfies TerminalStatusEventLike;

    const sessions = terminalStatusSessionsFromEvent(event);

    expect(sessions).toEqual([]);
  });
});

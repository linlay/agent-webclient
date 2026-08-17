import { createStandaloneBtwSession } from "@/features/btw/hooks/useStandaloneBtwRuntime";

describe("standalone BTW session", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it("uses an incoming btwId only as branch context and starts with an empty timeline", () => {
    const session = createStandaloneBtwSession(
      "chat_1",
      "btw_existing",
      { kind: "agent", agentKey: "agent_1" },
    );

    expect(session).toMatchObject({
      parentChatId: "chat_1",
      btwId: "btw_existing",
      agentKey: "agent_1",
      status: "idle",
    });
    expect(session.projection.timelineOrder).toEqual([]);
    expect(session.projection.timelineNodes.size).toBe(0);
  });

  it("creates a Team-owned branch without inventing an agent identity", () => {
    const session = createStandaloneBtwSession(
      "chat_team",
      "",
      { kind: "orchestrated-team", teamId: "team_1" },
    );

    expect(session.owner).toEqual({ kind: "orchestrated-team", teamId: "team_1" });
    expect(session.agentKey).toBe("");
  });
});

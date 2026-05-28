jest.mock("antd", () => ({
  Input: {
    TextArea: () => null,
  },
  Select: () => null,
  Spin: ({ children }: { children?: unknown }) => children || null,
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: jest.fn(() => ({ state: { agents: [] }, dispatch: jest.fn() })),
}));

jest.mock("@/features/transport/lib/apiClientProxy", () => ({
  createAgent: jest.fn(),
  deleteAgent: jest.fn(),
  getAgent: jest.fn(),
  getAgentEditorOptions: jest.fn(),
  getAgents: jest.fn(),
  getSkills: jest.fn(),
  getTools: jest.fn(),
  putAgentOrder: jest.fn(),
  updateAgent: jest.fn(),
}));

jest.mock("@/shared/icons/agent", () => ({
  AGENT_ICON_NAMES: [],
  AgentIcon: () => null,
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: () => null,
}));

jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({ children }: { children?: unknown }) => children || null,
}));

import {
  buildAgentListSummary,
  saveAgentOrderRequest,
  shouldStartAgentConsoleBootstrap,
} from "@/features/workers/components/AgentConsole";

const { getAgents, putAgentOrder } = jest.requireMock(
  "@/features/transport/lib/apiClientProxy",
) as {
  getAgents: jest.Mock;
  putAgentOrder: jest.Mock;
};

describe("AgentConsole order persistence", () => {
  beforeEach(() => {
    getAgents.mockReset();
    putAgentOrder.mockReset();
  });

  it("persists agent order without reloading the agent list", async () => {
    putAgentOrder.mockResolvedValue({ data: { order: ["agent-b", "agent-a"] } });

    await saveAgentOrderRequest([
      { key: "agent-b", name: "Agent B" },
      { key: "agent-a", name: "Agent A" },
    ]);

    expect(putAgentOrder).toHaveBeenCalledWith({ order: ["agent-b", "agent-a"] });
    expect(getAgents).not.toHaveBeenCalled();
  });

  it("propagates order persistence errors without reloading the agent list", async () => {
    const error = new Error("order failed");
    putAgentOrder.mockRejectedValue(error);

    await expect(
      saveAgentOrderRequest([{ key: "agent-a", name: "Agent A" }]),
    ).rejects.toBe(error);

    expect(getAgents).not.toHaveBeenCalled();
  });
});

describe("shouldStartAgentConsoleBootstrap", () => {
  it("allows a bootstrap path to run once for a component instance", () => {
    const bootstrapRef = { current: false };

    expect(shouldStartAgentConsoleBootstrap(bootstrapRef)).toBe(true);
    expect(bootstrapRef.current).toBe(true);
    expect(shouldStartAgentConsoleBootstrap(bootstrapRef)).toBe(false);
  });
});

describe("buildAgentListSummary", () => {
  it("uses /api/agents meta fields for list summaries", () => {
    expect(
      buildAgentListSummary({
        key: "agent-a",
        name: "Agent A",
        meta: {
          mode: "REACT",
          modelKey: "gpt-5",
          toolsCount: 8,
          skillsCount: 3,
        },
      }),
    ).toEqual({
      mode: "REACT",
      modelKey: "gpt-5",
      toolsCount: 8,
      skillsCount: 3,
    });
  });

  it("keeps compatibility with legacy meta arrays", () => {
    expect(
      buildAgentListSummary({
        key: "agent-a",
        name: "Agent A",
        meta: {
          mode: "PLAN_EXECUTE",
          model: "legacy-model",
          tools: ["bash", "file_read"],
          skills: ["browser"],
        },
      }),
    ).toEqual({
      mode: "PLAN_EXECUTE",
      modelKey: "legacy-model",
      toolsCount: 2,
      skillsCount: 1,
    });
  });
});

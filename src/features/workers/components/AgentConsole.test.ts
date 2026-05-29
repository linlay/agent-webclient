import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/shared/i18n";

jest.mock("antd", () => {
  const React = require("react");
  const Input = ({ prefix, ...props }: any) =>
    React.createElement(
      "div",
      { className: "mock-input" },
      prefix,
      React.createElement("input", props),
    );
  Input.TextArea = (props: any) => React.createElement("textarea", props);
  return {
    Input,
    Select: ({ allowClear, loading, mode, optionFilterProp, options = [], showSearch, value, ...props }: any) =>
      React.createElement(
        "select",
        {
          ...props,
          multiple: mode === "multiple",
          value: mode === "multiple" ? value || [] : value,
        },
        options.map((option: any) =>
          React.createElement(
            "option",
            { key: option.value, value: option.value },
            option.label,
          ),
        ),
      ),
    Spin: ({ children }: { children?: unknown }) => children || null,
  };
});

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
  AgentConsole,
  agentConsoleListRequestOptions,
  buildDefinition,
  buildAgentListSummary,
  formFromDetail,
  saveAgentOrderRequest,
  shouldStartAgentConsoleBootstrap,
} from "@/features/workers/components/AgentConsole";

const { getAgents, putAgentOrder } = jest.requireMock(
  "@/features/transport/lib/apiClientProxy",
) as {
  getAgents: jest.Mock;
  putAgentOrder: jest.Mock;
};

const translate = (key: string) => key;

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

describe("agentConsoleListRequestOptions", () => {
  it("loads the /agents page list with all agents scope", () => {
    expect(agentConsoleListRequestOptions()).toEqual({ scope: "all" });
  });
});

describe("AgentConsole i18n rendering", () => {
  it("renders the empty console in Chinese", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );

    expect(html).toContain("智能体 0 个");
    expect(html).toContain("暂无匹配智能体。");
    expect(html).toContain("创建智能体");
  });

  it("renders the empty console in English", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "en-US", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );

    expect(html).toContain("Agents 0");
    expect(html).toContain("No matching agents.");
    expect(html).toContain("Create agent");
  });

  it("renders visibility and budget controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "en-US", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );

    expect(html).toContain("Visibility");
    expect(html).toContain("Budget");
    expect(html).not.toContain("Budget runTimeoutMs");
    expect(html).toContain("runTimeoutMs");
  });
});

describe("AgentConsole definition mapping", () => {
  it("reads budget text and visibility from the editable definition", () => {
    const form = formFromDetail({
      key: "agent-a",
      name: "Agent A",
      model: "gpt-5",
      mode: "REACT",
      tools: [],
      skills: [],
      controls: [],
      meta: {
        visibility: { scopes: ["nav"] },
        budget: { maxSteps: 12 },
      },
      definition: {
        key: "agent-a",
        name: "Agent A",
        visibility: { scopes: ["invoke", "internal"] },
        budget: {
          runTimeoutMs: 600000,
          maxSteps: 240,
          model: { maxCalls: 40 },
          tool: { maxCalls: 200 },
        },
      },
    });

    expect(form.visibilityScopes).toEqual(["invoke", "internal"]);
    expect(form.budgetText).toBe(JSON.stringify({
      runTimeoutMs: 600000,
      maxSteps: 240,
      model: { maxCalls: 40 },
      tool: { maxCalls: 200 },
    }, null, 2));
  });

  it("falls back to meta budget and visibility when definition omits them", () => {
    const form = formFromDetail({
      key: "agent-a",
      name: "Agent A",
      model: "gpt-5",
      mode: "REACT",
      tools: [],
      skills: [],
      controls: [],
      meta: {
        visibility: { scopes: ["copilot"] },
        budget: { maxSteps: 18, tool: { maxCalls: 9 } },
      },
      definition: {
        key: "agent-a",
        name: "Agent A",
      },
    });

    expect(form.visibilityScopes).toEqual(["copilot"]);
    expect(form.budgetText).toBe(JSON.stringify({ maxSteps: 18, tool: { maxCalls: 9 } }, null, 2));
  });

  it("writes budget JSON and visibility", () => {
    const form = formFromDetail({
      key: "agent-a",
      name: "Agent A",
      model: "gpt-5",
      mode: "REACT",
      tools: [],
      skills: [],
      controls: [],
      meta: {},
      definition: {
        key: "agent-a",
        name: "Agent A",
        budget: {
          tokenLimit: 123,
          model: { coolDownMs: 50 },
          tool: { retry: 2 },
        },
      },
    });

    const definition = buildDefinition(
      {
        ...form,
        visibilityScopes: ["nav", "invoke"],
        budgetText: JSON.stringify({
          tokenLimit: 123,
          runTimeoutMs: 1000,
          maxSteps: 24,
          model: { coolDownMs: 50, maxCalls: 8 },
          tool: { retry: 2, maxCalls: 16 },
        }, null, 2),
      },
      {
        key: "agent-a",
        name: "Agent A",
        budget: {
          tokenLimit: 123,
          model: { coolDownMs: 50 },
          tool: { retry: 2 },
        },
      },
      translate,
    );

    expect(definition.visibility).toEqual({ scopes: ["nav", "invoke"] });
    expect(definition.budget).toEqual({
      tokenLimit: 123,
      runTimeoutMs: 1000,
      maxSteps: 24,
      model: { coolDownMs: 50, maxCalls: 8 },
      tool: { retry: 2, maxCalls: 16 },
    });
  });

  it("omits budget when budget text is blank", () => {
    const form = formFromDetail({
      key: "agent-a",
      name: "Agent A",
      model: "gpt-5",
      mode: "REACT",
      tools: [],
      skills: [],
      controls: [],
      meta: {},
      definition: {
        key: "agent-a",
        name: "Agent A",
        budget: {
          runTimeoutMs: 1000,
          maxSteps: 24,
          model: { maxCalls: 8 },
          tool: { maxCalls: 16 },
        },
      },
    });

    const definition = buildDefinition(
      {
        ...form,
        budgetText: "",
      },
      {
        key: "agent-a",
        name: "Agent A",
        budget: {
          runTimeoutMs: 1000,
          maxSteps: 24,
          model: { maxCalls: 8 },
          tool: { maxCalls: 16 },
        },
      },
      translate,
    );

    expect(definition.budget).toBeUndefined();
  });

  it("rejects invalid or non-object budget JSON", () => {
    const form = formFromDetail({
      key: "agent-a",
      name: "Agent A",
      model: "gpt-5",
      mode: "REACT",
      tools: [],
      skills: [],
      controls: [],
      meta: {},
      definition: {
        key: "agent-a",
        name: "Agent A",
      },
    });

    expect(() => buildDefinition({ ...form, budgetText: "[" }, {}, translate)).toThrow();
    expect(() => buildDefinition({ ...form, budgetText: "[]" }, {}, translate)).toThrow("agentConsole.error.jsonInvalid");
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

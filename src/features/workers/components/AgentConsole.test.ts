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
  const Modal = ({ children }: { children?: unknown }) => children || null;
  Modal.confirm = jest.fn();
  return {
    Checkbox: ({ children, ...props }: any) => React.createElement("label", null, React.createElement("input", { ...props, type: "checkbox" }), children),
    Input,
    Modal,
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
    Switch: ({ checked, ...props }: any) =>
      React.createElement("input", { ...props, type: "checkbox", checked }),
    Spin: ({ children }: { children?: unknown }) => children || null,
  };
});

const mockAppState = { agents: [] as any[] };
const mockDispatch = jest.fn();

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: jest.fn(() => ({ state: mockAppState, dispatch: mockDispatch })),
}));

jest.mock("@/shared/data", () => ({
  createAgent: jest.fn(),
  deleteAgent: jest.fn(),
  deleteAdminAgentPrivateSkill: jest.fn(),
  getAdminAgentDetail: jest.fn(),
  getAdminAgentEditorOptions: jest.fn(),
  getAdminAgents: jest.fn(),
  getAdminSource: jest.fn(),
  getAdminSkills: jest.fn(),
  getAdminTools: jest.fn(),
  importAdminAgentPrivateSkill: jest.fn(),
  putAdminAgentOrder: jest.fn(),
  updateAgent: jest.fn(),
  updateAdminSource: jest.fn(),
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
  AGENT_CONSOLE_ADMIN_LIST_ROUTE,
  AGENT_FORM_SECTION_IDS,
  buildAgentConfigDirectoryOpenOptions,
  buildAdminToolOption,
  buildDefinition,
  buildAgentListSummary,
  defaultReasoningEffort,
  firstAdminAgentDiagnosticMessage,
  formFromDetail,
  getModelReasoningEfforts,
  hasEditableAdminDefinition,
  isInvalidAdminAgent,
  mergeAgentSkillOptions,
  privateSkillsFromDetail,
  readAdminAgentDiagnostics,
  resolveActiveAgentFormSection,
  resolveAgentSavePlacement,
  resolveAdminAgentSourcePath,
  saveAgentOrderRequest,
  shouldShowAgentDirectoryButton,
  shouldShowAgentSectionNav,
  shouldStartAgentConsoleBootstrap,
  toolOptionLabel,
} from "@/features/workers/components/AgentConsole";

const { getAdminAgents, putAdminAgentOrder } = jest.requireMock(
  "@/shared/data",
) as {
  getAdminAgents: jest.Mock;
  putAdminAgentOrder: jest.Mock;
};

const translate = (key: string) => key;

describe("AgentConsole private skill options", () => {
  it("prefers the Agent-private source when it has the same key as the center", () => {
    const options = mergeAgentSkillOptions(
      [{ key: "office", label: "Office" }],
      [
        {
          key: "office",
          name: "Private Office",
          status: "ready",
          enabled: true,
          overridesCenter: true,
        },
      ],
      ["office"],
      translate,
    );

    expect(options).toEqual([
      expect.objectContaining({
        key: "office",
        label: "Private Office · agentConsole.privateSkill.source.private",
        source: "private",
        overridesCenter: true,
      }),
    ]);
  });

  it("renders a short private acronym without repeating its key", () => {
    const options = mergeAgentSkillOptions(
      [{ key: "cdp", label: "cdp" }],
      [
        {
          key: "cdp",
          name: "cdp",
          status: "ready",
          enabled: true,
          overridesCenter: true,
        },
      ],
      ["cdp"],
      translate,
    );

    expect(options[0]?.label).toBe("CDP · agentConsole.privateSkill.source.private");
  });

  it("reads private skills only from admin Agent detail", () => {
    expect(privateSkillsFromDetail(null)).toEqual([]);
    expect(
      privateSkillsFromDetail({
        key: "agent-a",
        name: "Agent A",
        mode: "REACT",
        tools: [],
        skills: [],
        controls: [],
        meta: {},
        status: "ready",
        privateSkills: [
          {
            key: "private",
            name: "Private",
            status: "ready",
            enabled: true,
            overridesCenter: false,
          },
        ],
      } as any),
    ).toHaveLength(1);
  });
});

describe("AgentConsole order persistence", () => {
  beforeEach(() => {
    mockAppState.agents = [];
    mockDispatch.mockReset();
    getAdminAgents.mockReset();
    putAdminAgentOrder.mockReset();
  });

  it("persists agent order without reloading the agent list", async () => {
    putAdminAgentOrder.mockResolvedValue({ data: { order: ["agent-b", "agent-a"] } });

    await saveAgentOrderRequest([
      { key: "agent-b", name: "Agent B" },
      { key: "agent-a", name: "Agent A" },
    ]);

    expect(putAdminAgentOrder).toHaveBeenCalledWith({ order: ["agent-b", "agent-a"] });
    expect(getAdminAgents).not.toHaveBeenCalled();
  });

  it("propagates order persistence errors without reloading the agent list", async () => {
    const error = new Error("order failed");
    putAdminAgentOrder.mockRejectedValue(error);

    await expect(
      saveAgentOrderRequest([{ key: "agent-a", name: "Agent A" }]),
    ).rejects.toBe(error);

    expect(getAdminAgents).not.toHaveBeenCalled();
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

describe("AGENT_CONSOLE_ADMIN_LIST_ROUTE", () => {
  it("loads the /agents management page from the admin discovery endpoint", () => {
    expect(AGENT_CONSOLE_ADMIN_LIST_ROUTE).toBe("/api/admin/agents");
  });
});

describe("AgentConsole admin diagnostics", () => {
  beforeEach(() => {
    mockAppState.agents = [];
    mockDispatch.mockReset();
  });

  it("reads invalid status and the first diagnostic message", () => {
    const agent = {
      key: "bad-agent",
      name: "Bad Agent",
      status: "invalid",
      diagnostics: [
        {
          severity: "error",
          code: "invalid_yaml",
          message: "yaml: did not find expected key",
          sourcePath: "/agents/bad-agent/agent.yaml",
        },
      ],
    };

    expect(isInvalidAdminAgent(agent)).toBe(true);
    expect(firstAdminAgentDiagnosticMessage(agent)).toBe("yaml: did not find expected key");
    expect(readAdminAgentDiagnostics(agent)).toEqual([
      {
        severity: "error",
        code: "invalid_yaml",
        message: "yaml: did not find expected key",
        sourcePath: "/agents/bad-agent/agent.yaml",
      },
    ]);
  });

  it("allows invalid details with a parsed definition and blocks invalid YAML without one", () => {
    expect(
      hasEditableAdminDefinition({
        key: "semantic-error",
        name: "Semantic Error",
        status: "invalid",
        definition: { key: "semantic-error", name: "Semantic Error" },
      } as any),
    ).toBe(true);
    expect(
      hasEditableAdminDefinition({
        key: "invalid-yaml",
        name: "Invalid YAML",
        status: "invalid",
        diagnostics: [{ severity: "error", code: "invalid_yaml", message: "yaml failed" }],
      } as any),
    ).toBe(false);
  });

  it("uses source path as detail subtitle data without requiring diagnostics to render it", () => {
    const detail = {
      key: "invalid-yaml",
      name: "Invalid YAML",
      status: "invalid",
      diagnostics: [
        {
          severity: "error",
          code: "invalid_yaml",
          message: "yaml failed",
          sourcePath: "/agents/invalid-yaml/agent.yml",
        },
      ],
    } as any;

    expect(resolveAdminAgentSourcePath(detail)).toBe("/agents/invalid-yaml/agent.yml");
    expect(readAdminAgentDiagnostics(detail)[0]).toMatchObject({
      message: "yaml failed",
      sourcePath: "/agents/invalid-yaml/agent.yml",
    });
  });

  it("renders invalid agent rows with status and diagnostic text", () => {
    mockAppState.agents = [
      {
        key: "bad-agent",
        name: "Bad Agent",
        role: "Fix me",
        status: "invalid",
        diagnostics: [
          {
            severity: "error",
            code: "invalid_yaml",
            message: "yaml failed",
            sourcePath: "/agents/bad-agent/agent.yml",
          },
        ],
        meta: { mode: "REACT", modelKey: "gpt-5" },
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "en-US", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );

    expect(html).toContain("Invalid");
    expect(html).toContain("yaml failed");
    expect(html).not.toContain("/agents/bad-agent/agent.yml");
  });
});

describe("AgentConsole i18n rendering", () => {
  beforeEach(() => {
    mockAppState.agents = [];
    mockDispatch.mockReset();
  });

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

  it("separates standalone page and embedded console layout contracts", () => {
    const renderConsole = (embedded = false) => renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "en-US", persistLocale: false },
        React.createElement(AgentConsole, { embedded }),
      ),
    );

    const pageHtml = renderConsole();
    const embeddedHtml = renderConsole(true);

    expect(pageHtml).toContain("management-page-console");
    expect(pageHtml).not.toContain("command-modal-section");
    expect(embeddedHtml).toContain("command-modal-section");
    expect(embeddedHtml).toContain("is-embedded");
    expect(embeddedHtml).not.toContain("management-page-console");
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

  it("renders five flat structured sections in the planned order", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );

    const positions = AGENT_FORM_SECTION_IDS.map((id) =>
      html.indexOf(`id="${id}"`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html.match(/class="agent-section-nav-link tw:/g)).toHaveLength(5);
    expect(html).not.toContain("agent-config-box");
    expect(html).not.toContain("<fieldset");
  });

  it("shows anchors only for editable structured forms and directory buttons only for saved paths", () => {
    expect(shouldShowAgentSectionNav("structured", true)).toBe(true);
    expect(shouldShowAgentSectionNav("source", true)).toBe(false);
    expect(shouldShowAgentSectionNav("structured", false)).toBe(false);
    expect(shouldShowAgentDirectoryButton("edit", "/agents/a/agent.yml")).toBe(true);
    expect(shouldShowAgentDirectoryButton("edit", "")).toBe(false);
    expect(shouldShowAgentDirectoryButton("create", "/agents/a/agent.yml")).toBe(false);
  });

  it("renders exactly one edit save based on whether the sticky anchor bar is available", () => {
    expect(resolveAgentSavePlacement("edit", "structured", true)).toEqual({
      header: false,
      sticky: true,
      footer: false,
    });
    expect(resolveAgentSavePlacement("edit", "source", true)).toEqual({
      header: true,
      sticky: false,
      footer: false,
    });
    expect(resolveAgentSavePlacement("create", "structured", true)).toEqual({
      header: false,
      sticky: false,
      footer: true,
    });
  });

  it("resolves the active anchor from content scroll position and locks prompts at the bottom", () => {
    const sectionTops = [120, 420, 760, 1100, 1450];
    expect(resolveActiveAgentFormSection(sectionTops, 80, false)).toBe(
      AGENT_FORM_SECTION_IDS[0],
    );
    expect(resolveActiveAgentFormSection(sectionTops, 800, false)).toBe(
      AGENT_FORM_SECTION_IDS[2],
    );
    expect(resolveActiveAgentFormSection(sectionTops, 800, true)).toBe(
      AGENT_FORM_SECTION_IDS[4],
    );
  });

  it("opens the registered agent config directory instead of its workspace", () => {
    expect(buildAgentConfigDirectoryOpenOptions(" agent-a ")).toEqual({
      agentKey: "agent-a",
      directoryType: "config",
    });
    expect(buildAgentConfigDirectoryOpenOptions(" ")).toBeNull();
  });

  it("keeps visibility in basic properties and full-width context controls together", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "en-US", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );
    const basic = html.slice(
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[0]}"`),
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[1]}"`),
    );
    const context = html.slice(
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[2]}"`),
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[3]}"`),
    );
    const advanced = html.slice(
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[3]}"`),
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[4]}"`),
    );

    expect(basic).toContain("agent-visibility-input");
    expect(advanced).not.toContain("agent-visibility-input");
    expect(context).toContain("agent-tags-input");
    expect(context).toContain("agent-tools-input");
    expect(context).toContain("agent-skills-input");
    expect(context.match(/agent-form-full-width/g)).toHaveLength(3);
  });
});

describe("AgentConsole tool options", () => {
  it("builds tool select labels from flat sourceCategory and kind fields only", () => {
    const option = buildAdminToolOption({
      key: "web_search",
      label: "Search",
      sourceCategory: "external",
      sourceType: "agent-local",
      kind: "backend",
    });

    expect(option).toEqual({
      key: "web_search",
      label: "Search",
      sourceCategory: "external",
      kind: "backend",
    });
    expect(toolOptionLabel(option!, (key) => ({ "toolSource.external": "External" }[key] || key))).toBe(
      "Search · web_search · External",
    );

    const legacyOnly = buildAdminToolOption({
      key: "legacy",
      label: "Legacy",
      source: "platform",
      meta: { kind: "frontend" },
    });

    expect(legacyOnly).toMatchObject({
      key: "legacy",
      label: "Legacy",
      sourceCategory: "",
      kind: "",
    });
    expect(toolOptionLabel(legacyOnly!, (key) => key)).toBe("Legacy · legacy");
  });
});

describe("AgentConsole definition mapping", () => {
  it("reads greetings from definition first and falls back to detail data", () => {
    const withDefinition = formFromDetail({
      key: "agent-a",
      name: "Agent A",
      model: "gpt-5",
      mode: "REACT",
      tools: [],
      skills: [],
      controls: [],
      greetings: ["detail greeting"],
      meta: {},
      definition: {
        key: "agent-a",
        name: "Agent A",
        greetings: [" definition greeting ", ""],
      },
    });
    const fromDetail = formFromDetail({
      key: "agent-b",
      name: "Agent B",
      model: "gpt-5",
      mode: "REACT",
      tools: [],
      skills: [],
      controls: [],
      greetings: [" detail fallback "],
      meta: {},
    });

    expect(withDefinition.greetings).toEqual(["definition greeting"]);
    expect(fromDetail.greetings).toEqual(["detail fallback"]);
  });

  it("normalizes greetings and wonders on save and removes empty fields", () => {
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
        greetings: ["old greeting"],
        wonders: ["old wonder"],
      },
    });
    const normalized = buildDefinition(
      {
        ...form,
        greetings: [" Hello ", "", " Welcome back "],
        wonders: [" Try this ", "  "],
      },
      {
        key: "agent-a",
        name: "Agent A",
        greetings: ["old greeting"],
        wonders: ["old wonder"],
      },
      translate,
    );
    const cleared = buildDefinition(
      { ...form, greetings: ["  "], wonders: [] },
      {
        key: "agent-a",
        name: "Agent A",
        greetings: ["old greeting"],
        wonders: ["old wonder"],
      },
      translate,
    );

    expect(normalized.greetings).toEqual(["Hello", "Welcome back"]);
    expect(normalized.wonders).toEqual(["Try this"]);
    expect(cleared.greetings).toBeUndefined();
    expect(cleared.wonders).toBeUndefined();
  });

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

describe("AgentConsole reasoning configuration", () => {
  const detailWithReasoning = (reasoning: Record<string, unknown>) => ({
    key: "agent-a",
    name: "Agent A",
    model: "deepseek-v4-pro",
    mode: "REACT",
    tools: [],
    skills: [],
    controls: [],
    meta: {},
    definition: {
      key: "agent-a",
      name: "Agent A",
      modelConfig: {
        modelKey: "deepseek-v4-pro",
        temperature: 0.3,
        reasoning,
      },
    },
  });

  it("reads existing YAML reasoning and preserves an enabled configuration without an effort", () => {
    const configuredForm = formFromDetail(
      detailWithReasoning({ enabled: true, effort: "high" }),
    );
    expect(configuredForm.reasoningConfigured).toBe(true);
    expect(configuredForm.reasoningEnabled).toBe(true);
    expect(configuredForm.reasoningEffort).toBe("HIGH");

    const noEffortForm = formFromDetail(detailWithReasoning({ enabled: true }));
    const definition = buildDefinition(
      noEffortForm,
      detailWithReasoning({ enabled: true }).definition,
      translate,
      true,
    );
    expect(definition.modelConfig).toEqual({
      modelKey: "deepseek-v4-pro",
      temperature: 0.3,
      reasoning: { enabled: true },
    });
  });

  it("writes an explicit disabled setting without a stale effort", () => {
    const form = formFromDetail(detailWithReasoning({ enabled: true, effort: "HIGH" }));
    const definition = buildDefinition(
      { ...form, reasoningConfigured: true, reasoningEnabled: false, reasoningEffort: "" },
      detailWithReasoning({ enabled: true, effort: "HIGH" }).definition,
      translate,
      true,
    );

    expect(definition.modelConfig).toEqual({
      modelKey: "deepseek-v4-pro",
      temperature: 0.3,
      reasoning: { enabled: false },
    });
  });

  it("removes reasoning when the selected model does not support it", () => {
    const form = formFromDetail(detailWithReasoning({ enabled: true, effort: "HIGH" }));
    const definition = buildDefinition(
      form,
      detailWithReasoning({ enabled: true, effort: "HIGH" }).definition,
      translate,
      false,
    );

    expect(definition.modelConfig).toEqual({
      modelKey: "deepseek-v4-pro",
      temperature: 0.3,
    });
  });

  it("preserves reasoning while the current model capability is unavailable", () => {
    const form = formFromDetail(detailWithReasoning({ enabled: true, effort: "HIGH" }));
    const definition = buildDefinition(
      form,
      detailWithReasoning({ enabled: true, effort: "HIGH" }).definition,
      translate,
    );

    expect(definition.modelConfig).toEqual({
      modelKey: "deepseek-v4-pro",
      temperature: 0.3,
      reasoning: { enabled: true, effort: "HIGH" },
    });
  });

  it("derives visible reasoning efforts from the selected model and chooses MEDIUM by default", () => {
    const models = [
      {
        key: "reasoner",
        isVision: false,
        reasoningEfforts: ["LOW", "NONE", "medium", "LOW", "XHIGH"],
      },
      { key: "chat", isVision: false, reasoningEfforts: [] },
      { key: "legacy", isVision: false },
    ];

    expect(getModelReasoningEfforts(models, "reasoner")).toEqual(["LOW", "MEDIUM", "XHIGH"]);
    expect(getModelReasoningEfforts(models, "chat")).toEqual([]);
    expect(getModelReasoningEfforts(models, "legacy")).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(getModelReasoningEfforts(models, "custom-model")).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(getModelReasoningEfforts(models, "")).toEqual([]);
    expect(defaultReasoningEffort(getModelReasoningEfforts(models, "reasoner"))).toBe("MEDIUM");
    expect(defaultReasoningEffort(["HIGH", "LOW"])).toBe("HIGH");
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

  it("uses current model, tool, and skill config fields", () => {
    expect(
      buildAgentListSummary({
        key: "agent-a",
        name: "Agent A",
        meta: {
          mode: "PLAN_EXECUTE",
        },
        modelConfig: {
          modelKey: "gpt-5",
        },
        toolConfig: {
          tools: [{ key: "bash" }, { key: "file_read" }],
        },
        skillConfig: {
          skills: [{ key: "browser" }],
        },
      }),
    ).toEqual({
      mode: "PLAN_EXECUTE",
      modelKey: "gpt-5",
      toolsCount: 2,
      skillsCount: 1,
    });
  });
});

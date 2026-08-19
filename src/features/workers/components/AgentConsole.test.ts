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
  const Modal = ({ open, children, title, okText, cancelText }: any) =>
    open
      ? React.createElement(
          "section",
          { "data-testid": "modal" },
          title,
          children,
          React.createElement("button", null, cancelText),
          React.createElement("button", null, okText),
        )
      : null;
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
    Tabs: ({ activeKey, items }: any) =>
      React.createElement(
        "div",
        { "data-testid": "tabs", "data-active-key": activeKey },
        items.map((item: any) =>
          React.createElement(
            "div",
            { key: item.key, "data-tab": item.key },
            React.createElement("span", null, item.label),
            item.children,
          ),
        ),
      ),
    Tooltip: ({ children }: { children?: unknown }) => children || null,
    message: {
      error: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
    },
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
  getAgents: jest.fn(),
  importAdminAgent: jest.fn(),
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
  AgentCreateModal,
  AGENT_CONSOLE_ADMIN_LIST_ROUTE,
  AGENT_FORM_SECTION_IDS,
  agentImportConflict,
  agentImportDiagnostics,
  agentImportSuccessMessageKey,
  buildAdminToolOption,
  buildDefinition,
  buildAgentListSummary,
  confirmAgentDraftDiscard,
  defaultReasoningEffort,
  firstAdminAgentDiagnosticMessage,
  formFromDetail,
  getModelReasoningEfforts,
  hasEditableAdminDefinition,
  importAgentArchiveWithOverwrite,
  isInvalidAdminAgent,
  mergeAgentSkillOptions,
  privateSkillsFromDetail,
  readAdminAgentDiagnostics,
  resolveAdminAgentSourcePath,
  saveAgentOrderRequest,
  shouldShowAgentSectionNav,
  shouldStartAgentConsoleBootstrap,
  toolOptionLabel,
  validateAgentArchiveFile,
} from "@/features/workers/components/AgentConsole";

const { getAdminAgents, putAdminAgentOrder } = jest.requireMock(
  "@/shared/data",
) as {
  getAdminAgents: jest.Mock;
  putAdminAgentOrder: jest.Mock;
};

const translate = (key: string) => key;

describe("Agent creation modal", () => {
  it("defaults to ZIP import and keeps direct creation as the second tab", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentCreateModal, {
        open: true,
        t: translate,
        onCancel: jest.fn(),
        onDirectCreate: jest.fn(() => true),
        onBeforeZipImport: jest.fn(() => true),
        onZipImport: jest.fn(),
        onImported: jest.fn(),
      }),
    );

    expect(html).toContain('data-active-key="zip"');
    expect(html.indexOf('data-tab="zip"')).toBeLessThan(
      html.indexOf('data-tab="direct"'),
    );
    expect(html).toContain("agentConsole.create.mode.zip");
    expect(html).toContain("agentConsole.create.mode.direct");
    expect(html).toContain('accept=".zip,application/zip"');
    expect(html).toContain("agentConsole.import.description");
    expect(html).not.toContain('id="agent-import-key"');
  });

  it("validates dropped or selected ZIP files before upload", () => {
    expect(validateAgentArchiveFile({ name: "agent.txt", size: 10 })).toBe("type");
    expect(validateAgentArchiveFile({ name: "agent.zip", size: 0 })).toBe("empty");
    expect(
      validateAgentArchiveFile({ name: "agent.zip", size: 32 * 1024 * 1024 + 1 }),
    ).toBe("size");
    expect(
      validateAgentArchiveFile({ name: "agent.ZIP", size: 32 * 1024 * 1024 }),
    ).toBe("");
  });

  it("keeps the draft when discard confirmation is cancelled", () => {
    const confirm = jest.fn(() => false);
    expect(confirmAgentDraftDiscard(false, "discard?", confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(confirmAgentDraftDiscard(true, "discard?", confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith("discard?");
  });

  it("parses diagnostics and the explicit overwrite contract", () => {
    const error = {
      status: 409,
      data: {
        error: {
          agentKey: "demo-agent",
          existingName: "Demo Agent",
          overwriteRequired: true,
          diagnostics: [
            {
              severity: "error",
              code: "invalid_agent_yaml",
              message: "invalid YAML",
              sourcePath: "agent.yml",
            },
          ],
        },
      },
    };
    expect(agentImportConflict(error)).toEqual({
      agentKey: "demo-agent",
      existingName: "Demo Agent",
    });
    expect(agentImportDiagnostics(error)).toEqual([
      {
        severity: "error",
        code: "invalid_agent_yaml",
        message: "invalid YAML",
        sourcePath: "agent.yml",
      },
    ]);
  });

  it("retries the same file with overwrite=true after confirmation", async () => {
    const file = { name: "demo.zip", size: 10 } as File;
    const ready = {
      key: "demo-agent",
      name: "Demo Agent",
      status: "ready",
    } as any;
    const importArchive = jest
      .fn()
      .mockRejectedValueOnce({
        status: 409,
        data: {
          error: {
            agentKey: "demo-agent",
            existingName: "Demo Agent",
            overwriteRequired: true,
          },
        },
      })
      .mockResolvedValueOnce(ready);
    const confirmOverwrite = jest.fn(async () => true);

    await expect(
      importAgentArchiveWithOverwrite(file, importArchive, confirmOverwrite),
    ).resolves.toBe(ready);
    expect(importArchive.mock.calls).toEqual([
      [file, false],
      [file, true],
    ]);
    expect(confirmOverwrite).toHaveBeenCalledWith({
      agentKey: "demo-agent",
      existingName: "Demo Agent",
    });
  });

  it("uses distinct ready and invalid completion messages", () => {
    expect(agentImportSuccessMessageKey("ready")).toBe(
      "agentConsole.import.success",
    );
    expect(agentImportSuccessMessageKey("invalid")).toBe(
      "agentConsole.import.invalid",
    );
  });
});

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
    expect(pageHtml).toContain("280px_minmax(0,1fr)");
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

  it("renders five accessible tabs with one visible configuration panel", () => {
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
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(5);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/ hidden=""/g)).toHaveLength(4);
    expect(html).not.toContain("agent-config-box");
    expect(html).not.toContain("<fieldset");
  });

  it("shows tabs only for editable structured forms", () => {
    expect(shouldShowAgentSectionNav("structured", true)).toBe(true);
    expect(shouldShowAgentSectionNav("source", true)).toBe(false);
    expect(shouldShowAgentSectionNav("structured", false)).toBe(false);
  });

  it("keeps a single save action inside the sticky nav bar for every editor mode", () => {
    expect(shouldShowAgentSectionNav("structured", true)).toBe(true);
    expect(shouldShowAgentSectionNav("source", true)).toBe(false);
    expect(shouldShowAgentSectionNav("structured", false)).toBe(false);

    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );

    const nav = html.slice(html.indexOf("agent-section-nav "));
    expect(nav).toContain("agent-section-nav-actions");
    expect(nav).toContain("创建智能体");

    const afterSaveActions = html.slice(html.indexOf("agent-save-actions"));
    expect(afterSaveActions).not.toContain("创建智能体");
  });

  it("structures basic properties as identity and runtime sections", () => {
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
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[3]}"`),
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[4]}"`),
    );
    const advanced = html.slice(
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[4]}"`),
    );

    expect(basic).toContain("agent-mode-options");
    expect(basic).toContain('type="radio"');
    expect(basic).toContain("agent-visibility-options");
    expect(basic).toContain('type="checkbox"');
    expect(basic).not.toContain("agent-detail-path-field");
    expect(basic).toContain("agent-basic-identity");
    expect(basic).toContain("agent-identity-avatar");
    expect(basic).toContain("agent-basic-runtime");
    expect(basic).toContain("Identity information");
    expect(basic).toContain("Run mode");
    expect(advanced).not.toContain("agent-visibility-input");
    expect(context).toContain("agent-context-capabilities");
    expect(context).toContain("agent-context-options");
    expect(context).toContain("agent-selection-summary");
    expect(context).toContain("Manage tools");
    expect(context).toContain("Manage skills");
  });

  it("renders every advanced configuration as a plain full-width textarea", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "en-US", persistLocale: false },
        React.createElement(AgentConsole),
      ),
    );
    const advanced = html.slice(
      html.indexOf(`id="${AGENT_FORM_SECTION_IDS[4]}"`),
    );

    expect(advanced).toContain(
      'class="field-group agent-form-full-width',
    );
    expect(advanced.match(/agent-form-full-width/g)).toHaveLength(4);
    expect(advanced).toContain("agent-controls-input");
    expect(advanced).toContain("agent-runtime-input");
    expect(advanced).toContain("agent-budget-input");
    expect(advanced).toContain("agent-memory-input");
    expect(advanced).toContain("Memory Config");
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

    expect(withDefinition.greetingsText).toBe(JSON.stringify([
      " definition greeting ",
      "",
    ], null, 2));
    expect(fromDetail.greetingsText).toBe(JSON.stringify([
      " detail fallback ",
    ], null, 2));
  });

  it("preserves greetings and wonders JSON on save and removes blank fields", () => {
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
        greetingsText: '[" Hello ", "", " Welcome back "]',
        wondersText: '[" Try this ", "  "]',
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
      { ...form, greetingsText: "  ", wondersText: "" },
      {
        key: "agent-a",
        name: "Agent A",
        greetings: ["old greeting"],
        wonders: ["old wonder"],
      },
      translate,
    );

    expect(normalized.greetings).toEqual([" Hello ", "", " Welcome back "]);
    expect(normalized.wonders).toEqual([" Try this ", "  "]);
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
        reasoningEfforts: ["LOW", "NONE", "medium", "LOW", "XHIGH", "MAX"],
      },
      { key: "chat", isVision: false, reasoningEfforts: [] },
      { key: "legacy", isVision: false },
    ];

    expect(getModelReasoningEfforts(models, "reasoner")).toEqual(["LOW", "MEDIUM", "XHIGH", "MAX"]);
    expect(getModelReasoningEfforts(models, "chat")).toEqual([]);
    expect(getModelReasoningEfforts(models, "legacy")).toEqual(["LOW", "MEDIUM", "HIGH", "XHIGH", "MAX"]);
    expect(getModelReasoningEfforts(models, "custom-model")).toEqual(["LOW", "MEDIUM", "HIGH", "XHIGH", "MAX"]);
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

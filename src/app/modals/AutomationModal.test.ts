import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AUTOMATION_FORM_SECTION_IDS,
  CRON_PRESETS,
  AutomationModal,
  automationTimeLabel,
  automationSourcePath,
  buildCreateAutomationPayloadForSubmit,
  buildDuplicateAutomationPayload,
  buildUpdateAutomationPayloadForSubmit,
  fetchAutomationAgentsForSelect,
  isCurrentAutomationSourceRequest,
  resolveActiveAutomationFormSection,
  shouldShowAutomationExecutions,
  shouldLoadAutomationAgents,
  shouldStartAutomationConsoleBootstrap,
  splitAutomationCronExpression,
} from "@/app/modals/AutomationModal";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { getAutomations } from "@/shared/data";
import { getAgents as getAgentsHttp } from "@/shared/data";
import { I18nProvider, type Locale } from "@/shared/i18n";

const mockedDispatch = jest.fn();
const mockedUseAppState = jest.fn(() => ({ automations: [], agents: [] }));

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: jest.fn(() => mockedDispatch),
  useAppState: () => mockedUseAppState(),
}));

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
    Checkbox: ({ children, ...props }: any) =>
      React.createElement("label", null, React.createElement("input", { type: "checkbox", ...props }), children),
    Dropdown: ({ children, menu }: any) =>
      React.createElement(
        "div",
        { className: "mock-dropdown" },
        children,
        Array.isArray(menu?.items)
          ? menu.items.map((item: any, index: number) =>
              React.createElement(
                "div",
                {
                  key: item.key ?? index,
                  "data-menu-key": item.key ?? item.type ?? "",
                },
                item.label,
              ),
            )
          : null,
      ),
    Input,
    Select: ({
      options = [],
      showSearch,
      optionFilterProp,
      optionRender,
      labelRender,
      ...props
    }: any) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "select",
          props,
          options.map((option: any) =>
            React.createElement(
              "option",
              { key: option.value, value: option.value },
              option.label,
            ),
          ),
        ),
        optionRender
          ? React.createElement(
              "div",
              { className: "mock-select-options" },
              options.map((option: any) =>
                React.createElement(
                  React.Fragment,
                  { key: option.value },
                  optionRender({ data: option }),
                ),
              ),
            )
          : null,
      ),
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Tooltip: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: ({ type }: { type: string }) =>
    React.createElement("svg", { "data-agent-icon-type": type }),
}));

jest.mock("@/shared/data", () => ({
  createAutomation: jest.fn(),
  deleteAutomation: jest.fn(),
  getAgents: jest.fn(),
  getAutomation: jest.fn(),
  getAutomationExecutions: jest.fn(),
  getAutomations: jest.fn(),
  getAdminSource: jest.fn(),
  toggleAutomation: jest.fn(),
  updateAdminSource: jest.fn(),
  updateAutomation: jest.fn(),
}));

const mockedGetAutomations = getAutomations as jest.Mock;
const mockedGetAgentsHttp = getAgentsHttp as jest.Mock;

function createCurrentWorker(): CurrentWorkerSummary {
  return {
    key: "team:team-a",
    type: "team",
    sourceId: "team-a",
    displayName: "Alpha Team",
    role: "Ops",
    raw: {
      agentKeys: ["agent-a"],
    },
    row: {
      key: "team:team-a",
      type: "team",
      sourceId: "team-a",
      displayName: "Alpha Team",
      role: "Ops",
      teamAgentLabels: [],
      latestChatId: "",
      latestRunId: "",
      latestUpdatedAt: 0,
      latestChatName: "",
      latestRunContent: "",
      hasHistory: false,
      latestRunSortValue: -1,
      searchText: "",
    },
    relatedChats: [],
  };
}

function renderAutomationModal(locale: Locale, embedded = false) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale, persistLocale: false },
      React.createElement(AutomationModal, {
        currentWorker: createCurrentWorker(),
        agents: [
          { key: "agent-a", name: "小宅", role: "执行官" },
          { key: "agent-b", name: "小智", role: "分析师" },
        ],
        teams: [{ teamId: "team-a", name: "Alpha Team" }],
        embedded,
      }),
    ),
  );
}

describe("AutomationModal", () => {
  beforeEach(() => {
    mockedDispatch.mockClear();
    mockedUseAppState.mockReturnValue({ automations: [], agents: [] });
    mockedGetAgentsHttp.mockResolvedValue({
      status: 200,
      code: 0,
      msg: "ok",
      data: [
        { key: "agent-a", name: "小宅", role: "执行官" },
        { key: "agent-b", name: "小智", role: "分析师" },
      ],
    });
    mockedGetAutomations.mockResolvedValue({
      status: 200,
      code: 0,
      msg: "ok",
      data: {
        items: [
          {
            id: "sync_workspace_20260429_2146",
            name: "令宿 - 全量同步 workspace 子项目",
            description: "pull",
            cron: "0 9 * * *",
            agentKey: "agent-a",
            enabled: true,
            sourceFile:
              "/Users/demo/Project/agent-workspace/automations/sync_workspace_20260429_2146.yml",
          },
        ],
        total: 1,
      },
    });
  });

  it("separates standalone page and embedded console layout contracts", () => {
    const pageHtml = renderAutomationModal("en-US");
    const embeddedHtml = renderAutomationModal("en-US", true);

    expect(pageHtml).toContain("management-page-console");
    expect(pageHtml).toContain("280px_minmax(0,1fr)");
    expect(pageHtml).not.toContain("command-modal-section");
    expect(embeddedHtml).toContain("command-modal-section");
    expect(embeddedHtml).not.toContain("management-page-console");
  });

  it("allows the automation list bootstrap to run once per component instance", () => {
    const bootstrapRef = { current: false };

    expect(shouldStartAutomationConsoleBootstrap(bootstrapRef)).toBe(true);
    expect(bootstrapRef.current).toBe(true);
    expect(shouldStartAutomationConsoleBootstrap(bootstrapRef)).toBe(false);
  });

  it("only bootstraps automation agents when the current list is empty", () => {
    const bootstrapRef = { current: false };

    expect(shouldLoadAutomationAgents(bootstrapRef, [])).toBe(true);
    expect(bootstrapRef.current).toBe(true);
    expect(shouldLoadAutomationAgents(bootstrapRef, [])).toBe(false);
    expect(shouldLoadAutomationAgents({ current: false }, [{ key: "agent-a", name: "小宅" }])).toBe(false);
  });

  it("loads automation agent options through HTTP GET /api/agents without extra params", async () => {
    await expect(fetchAutomationAgentsForSelect()).resolves.toEqual([
      { key: "agent-a", name: "小宅", role: "执行官" },
      { key: "agent-b", name: "小智", role: "分析师" },
    ]);

    expect(mockedGetAgentsHttp).toHaveBeenCalledWith();
  });

  it("renders the automation console with create defaults from the current worker", () => {
    const html = renderAutomationModal("zh-CN");

    expect(html).toContain("自动化 0 个");
    expect(html).not.toContain("查询参数");
    expect(html).toContain("智能体");
    expect(html).toContain("小宅");
    expect(html).toContain("执行官");
    expect(html).not.toContain("automation-zone-input");
    expect(html).toContain("automation-cron-control");
    expect(html).toContain("automation-cron-preset-trigger");
    expect(html).toContain("常用");
    expect(html).toContain("新建对话");
    expect(html).toContain("添加选项");
    expect(html).not.toContain("automation-team-input");
    expect(html).toContain("每天 19:00");
    expect(html).not.toContain("automation-role-input");
    expect(html).toContain('aria-label="创建自动化"');
    expect(html).toContain('data-material-icon="smart_toy"');
    // 吸顶导航与区块标题使用短词「属性 / 执行」
    expect(html).toContain(">属性<");
    expect(html).toContain(">执行<");
    // 保存按钮：图标 + 保存
    expect(html).toContain(">保存<");
    // Agent 下拉选项携带图标渲染
    expect(html).toContain('data-agent-icon-type="agent"');
    // 常用预设：点击即赋值的动作菜单，不再渲染为带选中态的 select
    expect(html).not.toMatch(/class="automation-cron-preset-select"/);
    expect(html).toContain("automation-cron-preset-trigger");
    expect(html).toContain('data-menu-key="0 19 * * *"');
    expect(html).toContain('data-menu-key="30 9 * * 1-5"');
    expect(html).toContain('data-menu-key="*/10 * * * *"');
    expect(html).toContain('data-menu-key="0 */8 * * *"');
    expect(html).toContain('data-menu-key="10 22 * * *"');
    expect(html).toContain('data-menu-key="0 9,21 * * 0,6"');
    expect(html).toContain('data-menu-key="0 12 5,15,25 * *"');
  });

  it("renders the automation console in English", () => {
    const html = renderAutomationModal("en-US");

    expect(html).toContain("Automations 0");
    expect(html).not.toContain("Query parameters");
    expect(html).toContain("Agent");
    expect(html).toContain("Common presets");
    expect(html).toContain("Start a new chat");
    expect(html).not.toContain("automation-team-input");
    expect(html).toContain('aria-label="Create automation"');
    // 吸顶导航与区块标题使用短词 Properties / Executions
    expect(html).toContain(">Properties<");
    expect(html).toContain(">Executions<");
    // 保存按钮：图标 + Save
    expect(html).toContain(">Save<");
    // Common presets：点击即赋值的动作菜单，不再是带选中态的 select
    expect(html).toContain("Common presets");
    expect(html).not.toMatch(/class="automation-cron-preset-select"/);
  });

  it("marks the once-only 22:10 preset with remainingRuns 1", () => {
    const oncePreset = CRON_PRESETS.find(
      (preset) => preset.value === "10 22 * * *",
    );
    expect(oncePreset?.remainingRuns).toBe("1");
    for (const preset of CRON_PRESETS) {
      if (preset.value === "10 22 * * *") continue;
      expect(preset.remainingRuns).toBeUndefined();
    }
  });

  it("builds create and update payloads without TeamID and with the selected role", () => {
    const form = {
      id: "daily-demo",
      name: "Daily demo",
      description: "Run daily",
      cron: "0 9 * * *",
      agentKey: "agent-a",
      teamId: "team-a",
      zoneId: "Asia/Shanghai",
      remainingRuns: "3",
      enabled: true,
      message: "Summarize status",
      chatMode: "new" as const,
      chatId: "",
      role: "assistant",
      hidden: "",
      paramsText: "",
    };

    expect(buildCreateAutomationPayloadForSubmit(form)).toMatchObject({
      name: "Daily demo",
      agentKey: "agent-a",
      zoneId: "Asia/Shanghai",
      remainingRuns: 3,
      query: {
        message: "Summarize status",
        role: "assistant",
      },
    });
    expect(buildCreateAutomationPayloadForSubmit(form)).not.toHaveProperty("teamId");

    expect(buildUpdateAutomationPayloadForSubmit(form)).toMatchObject({
      id: "daily-demo",
      agentKey: "agent-a",
      query: {
        message: "Summarize status",
        role: "assistant",
      },
    });
    expect(buildUpdateAutomationPayloadForSubmit(form)).not.toHaveProperty("teamId");
  });

  it("only sends ChatId when the existing-chat option is selected", () => {
    const form = {
      id: "daily-demo",
      name: "Daily demo",
      description: "",
      cron: "0 9 * * *",
      agentKey: "agent-a",
      teamId: "",
      zoneId: "",
      remainingRuns: "",
      enabled: true,
      message: "Summarize status",
      chatMode: "new" as const,
      chatId: "chat-stale",
      role: "",
      hidden: "" as const,
      paramsText: "",
    };

    expect(buildCreateAutomationPayloadForSubmit(form).query).toEqual({
      message: "Summarize status",
    });
    expect(
      buildCreateAutomationPayloadForSubmit({
        ...form,
        chatMode: "existing",
      }).query,
    ).toEqual({
      message: "Summarize status",
      chatId: "chat-stale",
    });
    expect(buildCreateAutomationPayloadForSubmit(form)).not.toHaveProperty(
      "description",
    );
  });

  it("normalizes automation source files to display filenames", () => {
    const automation = {
      id: "sync_workspace_20260429_2146",
      name: "令宿 - 全量同步 workspace 子项目",
      description: "pull",
      cron: "0 9 * * *",
      agentKey: "agent-a",
      enabled: true,
      sourceFile:
        "/Users/demo/Project/agent-workspace/automations/sync_workspace_20260429_2146.yml",
    };

    expect(automationSourcePath(automation)).toBe("sync_workspace_20260429_2146.yml");
    expect(automationSourcePath({ ...automation, sourceFile: "" })).toBe("sync_workspace_20260429_2146");
  });

  it("ignores a source response once the user has selected another automation", () => {
    expect(isCurrentAutomationSourceRequest(3, 3, "daily-report", "daily-report")).toBe(true);
    expect(isCurrentAutomationSourceRequest(3, 4, "daily-report", "daily-report")).toBe(false);
    expect(isCurrentAutomationSourceRequest(3, 3, "daily-report", "weekly-report")).toBe(false);
  });

  it("shows execution logs only in structured editing mode", () => {
    expect(shouldShowAutomationExecutions("structured")).toBe(true);
    expect(shouldShowAutomationExecutions("source")).toBe(false);
  });

  it("renders only Basic and Executions as flat structured sections", () => {
    const html = renderAutomationModal("zh-CN");
    const positions = AUTOMATION_FORM_SECTION_IDS.map((id) =>
      html.indexOf(`id="${id}"`),
    );

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(html.match(/class="automation-section-nav-link tw:/g)).toHaveLength(2);
    expect(html).not.toContain("automation-section-query");
    expect(html).not.toContain("<fieldset");
  });

  it("keeps all core fields in Basic and hides empty optional fields", () => {
    const html = renderAutomationModal("zh-CN");
    const basicStart = html.indexOf(`id="${AUTOMATION_FORM_SECTION_IDS[0]}"`);
    const executionsStart = html.indexOf(
      `id="${AUTOMATION_FORM_SECTION_IDS[1]}"`,
    );

    [
      "automation-name-input",
      "automation-message-input",
      "automation-chat-mode-input",
      "automation-agent-input",
      "automation-cron-field-0",
      "automation-runs-input",
    ].forEach((id) => {
      const position = html.indexOf(`id="${id}"`);
      expect(position).toBeGreaterThan(basicStart);
      expect(position).toBeLessThan(executionsStart);
    });

    [
      "automation-chat-input",
      "automation-zone-input",
      "automation-description-input",
      "automation-role-input",
      "automation-hidden-select",
      "automation-params-input",
    ].forEach((id) => {
      expect(html).not.toContain(`id="${id}"`);
    });

    expect(html.indexOf("执行记录")).toBeGreaterThan(executionsStart);
  });

  it("orders the Basic fields as name, message, chat, agent, cron, and runs", () => {
    const html = renderAutomationModal("zh-CN");

    expect(html).toContain("automation-basic-form-grid");
    expect(html).toContain("automation-basic-form-full-width");

    const basicIds = [
      "automation-name-input",
      "automation-message-input",
      "automation-chat-mode-input",
      "automation-agent-input",
      "automation-cron-field-0",
      "automation-runs-input",
    ];
    const positions = basicIds.map((id) => html.indexOf(`id="${id}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));

    expect(html).toContain("Cron 表达式");
    expect(html).toContain("automation-chat-row");
    expect(html).toMatch(/automation-agent-input/);
    expect(html.match(/id="automation-cron-field-\d"/g)).toHaveLength(5);
    ["分", "时", "日", "月", "周"].forEach((label) => {
      expect(html).toContain(`<span>${label}</span>`);
    });
  });

  it("splits a traditional cron expression into minute, hour, day, month, and weekday", () => {
    expect(splitAutomationCronExpression("0 9 * * 1-5")).toEqual([
      "0",
      "9",
      "*",
      "*",
      "1-5",
    ]);
    expect(splitAutomationCronExpression("0  9 * *")).toEqual([
      "0",
      "",
      "9",
      "*",
      "*",
    ]);
  });

  it("links content scrolling to the active automation anchor", () => {
    const sectionTops = [120, 980];
    expect(resolveActiveAutomationFormSection(sectionTops, 80, false)).toBe(
      AUTOMATION_FORM_SECTION_IDS[0],
    );
    expect(resolveActiveAutomationFormSection(sectionTops, 1000, false)).toBe(
      AUTOMATION_FORM_SECTION_IDS[1],
    );
    expect(resolveActiveAutomationFormSection(sectionTops, 600, true)).toBe(
      AUTOMATION_FORM_SECTION_IDS[1],
    );
  });

  it("keeps platform readable automation times in their source timezone", () => {
    expect(
      automationTimeLabel(
        "2026-07-02T09:00:00+08:00",
        Date.UTC(2026, 6, 2, 1, 0, 0),
        "en-US",
      ),
    ).toBe("2026-07-02T09:00:00+08:00");
  });

  it("prefers execution startedTime over startedAt fallback", () => {
    expect(
      automationTimeLabel(
        "2026-07-02T09:00:00.123+08:00",
        Date.UTC(2026, 6, 2, 1, 0, 0),
        "en-US",
      ),
    ).toBe("2026-07-02T09:00:00.123+08:00");
  });

  it("renders automation list items as a two-line card (name + status / worker left, cron right)", () => {
    mockedUseAppState.mockReturnValue({
      automations: [
        {
          id: "sync_workspace_20260717",
          name: "全量同步 workspace 子项目",
          description: "pull",
          cron: "0 */2 * * *",
          agentKey: "agent-a",
          enabled: false,
          sourceFile: "/repo/automations/sync_workspace_20260717.yml",
        },
        {
          id: "missing_cron",
          name: "缺失 cron 的示例",
          description: "fallback",
          cron: "",
          agentKey: "agent-a",
          enabled: true,
          sourceFile: "/repo/automations/missing_cron.yml",
        },
      ],
      agents: [],
    });

    const html = renderAutomationModal("zh-CN");

    // 第一行：name + 状态 tag，不应再出现方括号智能体前缀
    expect(html).toContain("<strong>全量同步 workspace 子项目</strong>");
    expect(html).toContain("停用");
    expect(html).not.toMatch(/\[小宅\]/);

    // 第二行：智能体名(左) 与可读 cron(右) 分别落在独立 span 中
    expect(html).toContain("automation-list-item-meta-worker");
    expect(html).toContain("automation-list-item-meta-cron");
    expect(html).toMatch(
      /automation-list-item-meta-worker[^>]*>[\s\S]*data-material-icon="smart_toy"[\s\S]*<span>小宅<\/span>/,
    );
    expect(html).toMatch(
      /automation-list-item-meta-cron[^>]*>每 2 小时</,
    );
    // worker / cron 各自所在 span 的可见文本不应再含中点拼接
    expect(html).not.toMatch(/>小宅 · 0 \*\/\d \* \* \*</);
    expect(html).not.toMatch(/>小宅 · --</);
    // 列表卡片区域不再展示 next/last 字段标签（右侧表单的预设文案不受此约束）
    const listHtml = html.slice(
      html.indexOf("automation-list-items"),
      html.indexOf("automation-console-detail"),
    );
    expect(listHtml).not.toContain("Next");
    expect(listHtml).not.toContain("Last");
    expect(html).toContain("automation-list-item-menu-trigger");
    expect(html).toContain('data-material-icon="smart_toy"');

    // 缺值回退：cron 为空时显示 --
    expect(html).toMatch(/automation-list-item-meta-cron[^>]*>--/);
  });

  it("renders the two-line automation card in English with Disabled tag", () => {
    mockedUseAppState.mockReturnValue({
      automations: [
        {
          id: "sync_workspace_en",
          name: "Sync workspace subprojects",
          description: "pull",
          cron: "0 */2 * * *",
          agentKey: "agent-a",
          enabled: false,
          sourceFile: "/repo/automations/sync_workspace_en.yml",
        },
      ],
      agents: [],
    });

    const html = renderAutomationModal("en-US");

    expect(html).toContain("<strong>Sync workspace subprojects</strong>");
    expect(html).toContain("Disabled");
    expect(html).not.toMatch(/\[小宅\]/);
    // 列表卡片区域不再展示 next/last 字段标签（右侧表单的预设文案不受此约束）
    const listHtml = html.slice(
      html.indexOf("automation-list-items"),
      html.indexOf("automation-console-detail"),
    );
    expect(listHtml).not.toContain("Next");
    expect(listHtml).not.toContain("Last");
    expect(html).toMatch(
      /automation-list-item-meta-worker[^>]*>[\s\S]*<span>小宅<\/span>/,
    );
    expect(html).toMatch(/automation-list-item-meta-cron[^>]*>Every 2 hours</);
  });

  it("builds a disabled duplicate while preserving its target and query", () => {
    const payload = buildDuplicateAutomationPayload(
      {
        id: "team-report",
        name: "团队日报",
        description: "生成日报",
        cron: "0 18 * * 1-5",
        agentKey: "",
        teamId: "team-a",
        zoneId: "Asia/Shanghai",
        remainingRuns: 3,
        enabled: true,
        query: {
          message: "生成今天的日报",
          role: "automation",
          hidden: true,
          params: { format: "brief" },
        },
      },
      "团队日报 副本",
    );

    expect(payload).toEqual({
      name: "团队日报 副本",
      description: "生成日报",
      cron: "0 18 * * 1-5",
      teamId: "team-a",
      zoneId: "Asia/Shanghai",
      enabled: false,
      remainingRuns: 3,
      query: {
        message: "生成今天的日报",
        role: "automation",
        hidden: true,
        params: { format: "brief" },
      },
    });
  });
});

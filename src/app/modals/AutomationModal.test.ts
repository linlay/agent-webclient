import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AUTOMATION_FORM_SECTION_IDS,
  AutomationModal,
  automationTimeLabel,
  automationSourcePath,
  buildCreateAutomationPayloadForSubmit,
  buildUpdateAutomationPayloadForSubmit,
  fetchAutomationAgentsForSelect,
  isCurrentAutomationSourceRequest,
  resolveActiveAutomationFormSection,
  shouldShowAutomationExecutions,
  shouldLoadAutomationAgents,
  shouldStartAutomationConsoleBootstrap,
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
    Dropdown: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Input,
    Select: ({ options = [], showSearch, optionFilterProp, ...props }: any) =>
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
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Tooltip: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

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
    expect(html).toContain("查询参数");
    expect(html).toContain("智能体");
    expect(html).toContain("小宅");
    expect(html).toContain("执行官");
    expect(html).toContain("Asia/Shanghai");
    expect(html).toContain("automation-cron-control");
    expect(html).toContain("快捷选择");
    expect(html).not.toContain("automation-team-input");
    expect(html).toContain("每天 09:00");
    expect(html).toContain("value=\"user\"");
    expect(html).toContain(">user<");
    expect(html).toContain("创建自动化");
  });

  it("renders the automation console in English", () => {
    const html = renderAutomationModal("en-US");

    expect(html).toContain("Automations 0");
    expect(html).toContain("Query parameters");
    expect(html).toContain("Agent");
    expect(html).toContain("Quick presets");
    expect(html).not.toContain("automation-team-input");
    expect(html).toContain("Create automation");
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

  it("renders three flat structured sections in the planned order", () => {
    const html = renderAutomationModal("zh-CN");
    const positions = AUTOMATION_FORM_SECTION_IDS.map((id) =>
      html.indexOf(`id="${id}"`),
    );

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(html.match(/class="automation-section-nav-link tw:/g)).toHaveLength(3);
    expect(html).not.toContain("<fieldset");
  });

  it("keeps basic fields, query parameters, and execution status in their assigned groups", () => {
    const html = renderAutomationModal("zh-CN");
    const basicStart = html.indexOf(`id="${AUTOMATION_FORM_SECTION_IDS[0]}"`);
    const queryStart = html.indexOf(`id="${AUTOMATION_FORM_SECTION_IDS[1]}"`);
    const executionsStart = html.indexOf(
      `id="${AUTOMATION_FORM_SECTION_IDS[2]}"`,
    );

    [
      "automation-name-input",
      "automation-cron-input",
      "automation-agent-input",
      "automation-zone-input",
      "automation-runs-input",
      "automation-description-input",
    ].forEach((id) => {
      const position = html.indexOf(`id="${id}"`);
      expect(position).toBeGreaterThan(basicStart);
      expect(position).toBeLessThan(queryStart);
    });

    [
      "automation-message-input",
      "automation-chat-input",
      "automation-role-input",
      "automation-hidden-select",
      "automation-params-input",
    ].forEach((id) => {
      const position = html.indexOf(`id="${id}"`);
      expect(position).toBeGreaterThan(queryStart);
      expect(position).toBeLessThan(executionsStart);
    });

    expect(html.indexOf("执行记录")).toBeGreaterThan(executionsStart);
  });

  it("links content scrolling to the active automation anchor", () => {
    const sectionTops = [120, 520, 980];
    expect(resolveActiveAutomationFormSection(sectionTops, 80, false)).toBe(
      AUTOMATION_FORM_SECTION_IDS[0],
    );
    expect(resolveActiveAutomationFormSection(sectionTops, 600, false)).toBe(
      AUTOMATION_FORM_SECTION_IDS[1],
    );
    expect(resolveActiveAutomationFormSection(sectionTops, 600, true)).toBe(
      AUTOMATION_FORM_SECTION_IDS[2],
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

    // 第二行：智能体名(左) 与 cron(右) 分别落在独立 span 中
    expect(html).toContain("automation-list-item-meta-worker");
    expect(html).toContain("automation-list-item-meta-cron");
    expect(html).toMatch(
      /automation-list-item-meta-worker[^>]*>小宅</,
    );
    expect(html).toMatch(
      /automation-list-item-meta-cron[^>]*>0 \*\/\d \* \* \*</,
    );
    // worker / cron 各自所在 span 的可见文本不应再含中点拼接
    expect(html).not.toMatch(/>小宅 · 0 \*\/\d \* \* \*</);
    expect(html).not.toMatch(/>小宅 · --</);
    expect(html).not.toContain("Next");
    expect(html).not.toContain("Last");

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
    expect(html).not.toContain("Next");
    expect(html).not.toContain("Last");
    expect(html).toMatch(/automation-list-item-meta-worker[^>]*>小宅</);
    expect(html).toMatch(/automation-list-item-meta-cron[^>]*>0 \*\/\d \* \* \*</);
  });
});

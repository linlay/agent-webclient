import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AutomationModal,
  automationSourcePath,
  buildCreateAutomationPayloadForSubmit,
  buildUpdateAutomationPayloadForSubmit,
  fetchAutomationAgentsForSelect,
  shouldLoadAutomationAgents,
  shouldStartAutomationConsoleBootstrap,
} from "@/app/modals/AutomationModal";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { getAutomations } from "@/features/transport/lib/apiClientProxy";
import { getAgents as getAgentsHttp } from "@/shared/api/apiClient";
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

jest.mock("@/features/transport/lib/apiClientProxy", () => ({
  createAutomation: jest.fn(),
  deleteAutomation: jest.fn(),
  getAutomation: jest.fn(),
  getAutomationExecutions: jest.fn(),
  getAutomations: jest.fn(),
  toggleAutomation: jest.fn(),
  updateAutomation: jest.fn(),
}));

jest.mock("@/shared/api/apiClient", () => ({
  getAgents: jest.fn(),
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

function renderAutomationModal(locale: Locale) {
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
            id: "gitpull_zenmind_20260429_2146",
            name: "令宿 - 全量拉取 zenmind 子项目",
            description: "pull",
            cron: "0 9 * * *",
            agentKey: "agent-a",
            enabled: true,
            sourceFile:
              "/Users/linlay/Project/zenmind/zenmind-env/automations/gitpull_zenmind_20260429_2146.yml",
          },
        ],
        total: 1,
      },
    });
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
    expect(html).toContain("请求");
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
    expect(html).toContain("Request");
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
      id: "gitpull_zenmind_20260429_2146",
      name: "令宿 - 全量拉取 zenmind 子项目",
      description: "pull",
      cron: "0 9 * * *",
      agentKey: "agent-a",
      enabled: true,
      sourceFile:
        "/Users/linlay/Project/zenmind/zenmind-env/automations/gitpull_zenmind_20260429_2146.yml",
    };

    expect(automationSourcePath(automation)).toBe("gitpull_zenmind_20260429_2146.yml");
    expect(automationSourcePath({ ...automation, sourceFile: "" })).toBe("gitpull_zenmind_20260429_2146");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationModal, automationSourcePath } from "@/app/modals/AutomationModal";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { getAutomations } from "@/features/transport/lib/apiClientProxy";

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: jest.fn(() => jest.fn()),
  useAppState: jest.fn(() => ({ automations: [] })),
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
    Input,
    Select: ({ options = [], ...props }: any) =>
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

const mockedGetAutomations = getAutomations as jest.Mock;

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

describe("AutomationModal", () => {
  beforeEach(() => {
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

  it("renders the automation console with create defaults from the current worker", () => {
    const html = renderToStaticMarkup(
      React.createElement(AutomationModal, {
        currentWorker: createCurrentWorker(),
        agents: [
          { key: "agent-a", name: "小宅", role: "执行官" },
          { key: "agent-b", name: "小智", role: "分析师" },
        ],
        teams: [{ teamId: "team-a", name: "Alpha Team" }],
      }),
    );

    expect(html).toContain("自动化 0 个");
    expect(html).toContain("请求");
    expect(html).toContain("智能体");
    expect(html).toContain("小宅");
    expect(html).toContain("Asia/Shanghai");
    expect(html).toContain("automation-cron-control");
    expect(html).toContain("快捷选择");
    expect(html).toContain("value=\"team-a\"");
    expect(html).toContain("每天 09:00");
    expect(html).toContain("创建自动化");
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

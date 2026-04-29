import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScheduleModal, scheduleSourcePath } from "@/app/modals/ScheduleModal";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { getSchedules } from "@/features/transport/lib/apiClientProxy";

jest.mock("antd", () => {
  const React = require("react");
  return {
    Input: ({ prefix, ...props }: any) =>
      React.createElement("div", { className: "mock-input" }, prefix, React.createElement("input", props)),
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/features/transport/lib/apiClientProxy", () => ({
  createSchedule: jest.fn(),
  deleteSchedule: jest.fn(),
  getSchedule: jest.fn(),
  getScheduleExecutions: jest.fn(),
  getSchedules: jest.fn(),
  toggleSchedule: jest.fn(),
  updateSchedule: jest.fn(),
}));

const mockedGetSchedules = getSchedules as jest.Mock;

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

describe("ScheduleModal", () => {
  beforeEach(() => {
    mockedGetSchedules.mockResolvedValue({
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
              "/Users/linlay/Project/zenmind/zenmind-env/schedules/gitpull_zenmind_20260429_2146.yml",
          },
        ],
        total: 1,
      },
    });
  });

  it("renders the schedule console with create defaults from the current worker", () => {
    const html = renderToStaticMarkup(
      React.createElement(ScheduleModal, {
        currentWorker: createCurrentWorker(),
        agents: [
          { key: "agent-a", name: "小宅" },
          { key: "agent-b", name: "小智" },
        ],
      }),
    );

    expect(html).toContain("计划任务 0 个");
    expect(html).toContain("请求");
    expect(html).toContain("智能体");
    expect(html).toContain("小宅");
    expect(html).toContain("Asia/Shanghai");
    expect(html).toContain("schedule-cron-presets");
    expect(html).toContain("value=\"team-a\"");
    expect(html).toContain("每天 09:00");
    expect(html).toContain("创建任务");
  });

  it("normalizes schedule source files to display filenames", () => {
    const schedule = {
      id: "gitpull_zenmind_20260429_2146",
      name: "令宿 - 全量拉取 zenmind 子项目",
      description: "pull",
      cron: "0 9 * * *",
      agentKey: "agent-a",
      enabled: true,
      sourceFile:
        "/Users/linlay/Project/zenmind/zenmind-env/schedules/gitpull_zenmind_20260429_2146.yml",
    };

    expect(scheduleSourcePath(schedule)).toBe("gitpull_zenmind_20260429_2146.yml");
    expect(scheduleSourcePath({ ...schedule, sourceFile: "" })).toBe("gitpull_zenmind_20260429_2146");
  });
});

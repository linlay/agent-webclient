import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScheduleModal } from "@/app/modals/ScheduleModal";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

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
  it("renders the schedule console with create defaults from the current worker", () => {
    const html = renderToStaticMarkup(
      React.createElement(ScheduleModal, { currentWorker: createCurrentWorker() }),
    );

    expect(html).toContain("计划任务 0 个");
    expect(html).toContain("新建计划任务");
    expect(html).toContain("value=\"agent-a\"");
    expect(html).toContain("value=\"team-a\"");
    expect(html).toContain("每天 09:00");
    expect(html).toContain("创建任务");
  });
});

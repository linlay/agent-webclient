import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationEditor } from "@/features/automations/components/AutomationEditor";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { I18nProvider, type Locale } from "@/shared/i18n";

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => jest.fn(),
  useAppState: () => ({ automations: [], agents: [] }),
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
      React.createElement(
        "label",
        null,
        React.createElement("input", { type: "checkbox", ...props }),
        children,
      ),
    Dropdown: ({ children, menu }: any) =>
      React.createElement(
        "div",
        { className: "mock-dropdown" },
        children,
        menu?.items?.map((item: any, index: number) =>
          React.createElement(
            "div",
            { key: item.key ?? index, "data-menu-key": item.key ?? "" },
            item.label,
          ),
        ),
      ),
    Input,
    Popconfirm: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    Select: ({
      options = [],
      optionRender,
      showSearch: _showSearch,
      optionFilterProp: _optionFilterProp,
      labelRender: _labelRender,
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
          ? options.map((option: any) =>
              React.createElement(
                React.Fragment,
                { key: option.value },
                optionRender({ data: option }),
              ),
            )
          : null,
      ),
    Spin: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    Tooltip: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    message: { error: jest.fn(), success: jest.fn() },
  };
});

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: ({ type }: { type: string }) =>
    React.createElement("svg", { "data-agent-icon-type": type }),
}));

jest.mock("@/shared/data", () => ({
  createAutomation: jest.fn(),
  deleteAutomation: jest.fn(),
  getAdminSource: jest.fn(),
  getAutomation: jest.fn(),
  toggleAutomation: jest.fn(),
  updateAdminSource: jest.fn(),
  updateAutomation: jest.fn(),
}));

function currentWorker(): CurrentWorkerSummary {
  return {
    key: "agent:agent-a",
    type: "agent",
    sourceId: "agent-a",
    displayName: "小宅",
    role: "执行官",
    raw: {},
    row: {
      key: "agent:agent-a",
      type: "agent",
      sourceId: "agent-a",
      displayName: "小宅",
      role: "执行官",
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

function renderEditor(locale: Locale) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale, persistLocale: false },
      React.createElement(AutomationEditor, {
        automationId: "",
        currentWorker: currentWorker(),
        agents: [
          { key: "agent-a", name: "小宅", role: "执行官" },
          { key: "agent-b", name: "小智", role: "分析师" },
        ],
        teams: [],
      }),
    ),
  );
}

describe("AutomationEditor", () => {
  it("renders the editor-only create flow with current worker defaults", () => {
    const html = renderEditor("zh-CN");

    expect(html).toContain("command-modal-section");
    expect(html).toContain("is-editor-only");
    expect(html).toContain("automation-name-input");
    expect(html).toContain("automation-message-input");
    expect(html).toContain("automation-agent-input");
    expect(html).toContain("automation-cron-control");
    expect(html).toContain("小宅");
    expect(html).toContain('data-agent-icon-type="agent"');
    expect(html).toContain('aria-label="创建自动化"');
    expect(html).not.toContain("automation-console-list");
    expect(html).not.toContain("automation-section-executions");
  });

  it("renders the same form labels in English", () => {
    const html = renderEditor("en-US");

    expect(html).toContain("Properties");
    expect(html).toContain("Agent");
    expect(html).toContain("Common presets");
    expect(html).toContain('aria-label="Create automation"');
  });

  it("keeps list loading out of the editor runtime", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/features/automations/hooks/useAutomationEditorRuntime.ts",
      ),
      "utf8",
    );

    expect(source).toContain("getAutomation");
    expect(source).not.toContain("getAutomations");
  });
});

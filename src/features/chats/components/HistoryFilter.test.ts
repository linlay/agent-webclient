/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import dayjs from "dayjs";
import { HistoryFilter } from "@/features/chats/components/HistoryFilter";
import { I18nProvider } from "@/shared/i18n";

let datePickerProps: Array<{ onChange: (value: unknown) => void }> = [];

jest.mock("antd", () => {
  const React = require("react");
  return {
    Popover: ({ children, content }: any) =>
      React.createElement(React.Fragment, null, children, content),
    Select: () => React.createElement("div"),
    DatePicker: (props: any) => {
      datePickerProps.push(props);
      return React.createElement("div");
    },
  };
});

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: () => null,
}));

function renderHistoryFilter(
  props: Partial<React.ComponentProps<typeof HistoryFilter>> = {},
) {
  datePickerProps = [];
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale: "zh-CN", persistLocale: false },
      React.createElement(HistoryFilter, {
        agentKey: "",
        agents: [],
        dateRange: null,
        filteredCount: 3,
        totalCount: 10,
        onAgentChange: jest.fn(),
        onDateRangeChange: jest.fn(),
        onReset: jest.fn(),
        ...props,
      }),
    ),
  );
}

describe("HistoryFilter", () => {
  it("renders the icon, label, and filtered/total count", () => {
    const html = renderHistoryFilter();

    expect(html).toContain("history-filter-trigger");
    expect(html).toContain('data-material-icon="filter_list"');
    expect(html).toContain("筛选");
    expect(html).toContain("3/10");
  });

  it("marks the trigger active when a filter is applied", () => {
    const html = renderHistoryFilter({ agentKey: "alpha" });

    expect(html).toContain("history-filter-trigger is-active");
  });

  it("allows selecting only a start date", () => {
    const onDateRangeChange = jest.fn();
    renderHistoryFilter({ onDateRangeChange });

    const start = dayjs("2026-01-10");
    datePickerProps[0].onChange(start);
    expect(onDateRangeChange).toHaveBeenCalledWith([start, null]);
  });

  it("allows selecting only an end date", () => {
    const onDateRangeChange = jest.fn();
    renderHistoryFilter({ onDateRangeChange });

    const end = dayjs("2026-01-20");
    datePickerProps[1].onChange(end);
    expect(onDateRangeChange).toHaveBeenCalledWith([null, end]);
  });

  it("preserves the other date when one side changes", () => {
    const onDateRangeChange = jest.fn();
    const start = dayjs("2026-01-10");
    renderHistoryFilter({ dateRange: [start, null], onDateRangeChange });

    const end = dayjs("2026-01-20");
    datePickerProps[1].onChange(end);
    expect(onDateRangeChange).toHaveBeenCalledWith([start, end]);
  });
});

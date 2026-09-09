import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentSelector } from "@/features/chats/components/AgentSelector";
import { I18nProvider } from "@/shared/i18n";

let mockMenu: any;

jest.mock("antd", () => ({
  Dropdown: ({ children, menu }: any) => {
    mockMenu = menu;
    return React.createElement(
      "div",
      null,
      children,
      menu.items.filter((item: any) => item.type !== "divider").map((item: any) =>
        React.createElement("div", { key: item.key, "data-menu-key": item.key }, item.label),
      ),
    );
  },
}));

jest.mock("@/app/state/provider", () => ({
  useAppContext: () => ({
    state: {
      agents: [
        { key: "alpha", name: "Alpha", icon: { name: "focus" } },
        { key: "beta", name: "Beta" },
      ],
    },
    dispatch: jest.fn(),
  }),
}));

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: ({ type }: { type: string }) =>
    React.createElement("svg", { "data-agent-type": type }),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("svg", { "data-material-icon": name }),
}));

function renderAgentSelector(
  props: Partial<React.ComponentProps<typeof AgentSelector>> = {},
) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale: "zh-CN", persistLocale: false },
      React.createElement(AgentSelector, {
        value: "alpha",
        onChange: jest.fn(),
        ...props,
      }),
    ),
  );
}

describe("AgentSelector", () => {
  it("lists all agents first and marks only the selected agent", () => {
    const html = renderAgentSelector({ value: "alpha" });

    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain('data-menu-key="agent:alpha"');
    expect(html).toContain('data-menu-key="agent:beta"');
    expect(mockMenu.items[0].key).toBe("all");
    expect(mockMenu.selectedKeys).toEqual(["agent:alpha"]);
    expect(mockMenu.multiple).toBeUndefined();
    expect(html).toContain('data-agent-type="agent"');
    expect(html).toContain('data-material-icon="check"');
  });

  it("shows the single selected agent name as the trigger label", () => {
    const html = renderAgentSelector({ value: "beta" });

    expect(html).toContain("Beta");
  });

  it("replaces the selected agent and uses the all option to clear the filter", () => {
    const onChange = jest.fn();
    renderAgentSelector({ value: "alpha", onChange });
    mockMenu.onClick({ key: "agent:beta" });
    expect(onChange).toHaveBeenLastCalledWith("beta");
    mockMenu.onClick({ key: "all" });
    expect(onChange).toHaveBeenLastCalledWith("");
    mockMenu.onClick({ key: "agent:alpha" });
    expect(onChange).toHaveBeenLastCalledWith("alpha");
  });

  it("shows the all-agents label when nothing is selected", () => {
    const html = renderAgentSelector({ value: "" });

    expect(html).toContain("全部智能体");
    expect(mockMenu.selectedKeys).toEqual(["all"]);
  });

  it("keeps an unknown selected agent visible instead of claiming all agents", () => {
    const html = renderAgentSelector({ value: "archived-agent" });

    expect(html).toContain('title="archived-agent"');
    expect(mockMenu.selectedKeys).toEqual(["agent:archived-agent"]);
  });
});

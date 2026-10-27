import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("antd/es", () => {
  const React = require("react");
  return {
    Avatar: ({ icon, ...props }: { icon?: unknown }) =>
      React.createElement("span", props, icon),
  };
});


import { AGENT_ICON_NAMES, AgentIcon } from "./agent";

describe("AgentIcon", () => {
  it("exposes the new built-in icon names", () => {
    expect(AGENT_ICON_NAMES).toEqual(["general", "coder", "kbase", "team", "executor", "proxy"]);
    expect(AGENT_ICON_NAMES).not.toContain("ledger");
  });

  it("renders a known built-in icon as an inline SVG", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentIcon, {
        icon: { name: "coder" },
        type: "agent",
      }),
    );

    expect(html).toContain("<svg");
    expect(html).toContain('data-agent-icon-source="builtin"');
  });

  it("falls back to the default agent graphic for unknown agent icons", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentIcon, {
        icon: { name: "ledger" },
        type: "agent",
      }),
    );

    expect(html).toContain("<svg");
    expect(html).toContain('data-agent-icon-source="default"');
  });

  it("supports external SVG image paths", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentIcon, {
        icon: "/assets/agent.svg",
        type: "agent",
      }),
    );

    expect(html).toContain('src="/assets/agent.svg"');
    expect(html).toContain('data-agent-icon-source="external"');
  });
});

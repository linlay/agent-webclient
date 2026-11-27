import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsPage } from "@/app/pages/agents";

const navigateMock = jest.fn();
let locationMock = { pathname: "/agents", search: "?lang=en" };
let agentConsoleProps: {
  mobile?: boolean;
  selectedAgentKey?: string;
  onSelectAgentKey?: (agentKey: string) => void;
  onClearSelection?: () => void;
} = {};

jest.mock("react-router-dom", () => ({
  useLocation: () => locationMock,
  useNavigate: () => navigateMock,
  useParams: () => ({ agentKey: "" }),
}));

jest.mock("@/features/agents/components/AgentConsole", () => ({
  AgentConsole: (props: typeof agentConsoleProps) => {
    agentConsoleProps = props;
    return React.createElement("div", null, "agent console");
  },
}));

describe("AgentsPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    locationMock = { pathname: "/agents", search: "?lang=en" };
    agentConsoleProps = {};
  });

  it("preserves the route query when selecting and clearing agents", () => {
    renderToStaticMarkup(React.createElement(AgentsPage));

    agentConsoleProps.onSelectAgentKey?.("agent/a");
    expect(navigateMock).toHaveBeenCalledWith("/agents/agent%2Fa?lang=en");

    agentConsoleProps.onClearSelection?.();
    expect(navigateMock).toHaveBeenCalledWith("/agents?lang=en");
  });

  it("keeps one page for both shells and only switches the console presentation", () => {
    const desktopHtml = renderToStaticMarkup(React.createElement(AgentsPage));
    expect(agentConsoleProps.mobile).toBe(false);
    expect(desktopHtml).toContain('class="agents-page"');

    locationMock = { pathname: "/mobile/agents", search: "?lang=en" };
    const mobileHtml = renderToStaticMarkup(React.createElement(AgentsPage));
    expect(agentConsoleProps.mobile).toBe(true);
    expect(mobileHtml).toContain('class="agents-page"');
  });
});

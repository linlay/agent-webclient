import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsPage } from "@/app/pages/agents";

const navigateMock = jest.fn();
let agentConsoleProps: {
  selectedAgentKey?: string;
  onSelectAgentKey?: (agentKey: string) => void;
  onClearSelection?: () => void;
} = {};

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ search: "?lang=en" }),
  useNavigate: () => navigateMock,
  useParams: () => ({ agentKey: "" }),
}));

jest.mock("@/features/workers/components/AgentConsole", () => ({
  AgentConsole: (props: typeof agentConsoleProps) => {
    agentConsoleProps = props;
    return React.createElement("div", null, "agent console");
  },
}));

describe("AgentsPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    agentConsoleProps = {};
  });

  it("preserves the route query when selecting and clearing agents", () => {
    renderToStaticMarkup(React.createElement(AgentsPage));

    agentConsoleProps.onSelectAgentKey?.("agent/a");
    expect(navigateMock).toHaveBeenCalledWith("/agents/agent%2Fa?lang=en");

    agentConsoleProps.onClearSelection?.();
    expect(navigateMock).toHaveBeenCalledWith("/agents?lang=en");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectorsPage } from "@/app/pages/connectors";
import { RegistriesPage } from "@/app/pages/registries";

const navigate = jest.fn();
const mcpProps: Array<Record<string, unknown>> = [];

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ search: "?lang=zh-CN&theme=dark" }),
  useNavigate: () => navigate,
  useParams: () => ({ connectorId: "server/a" }),
}));

jest.mock("@/features/registries/components/RegistryConsole", () => ({
  RegistryConsole: () =>
    React.createElement("div", { "data-testid": "registry-console" }),
}));

jest.mock("@/features/connectors/components/ConnectorsConsole", () => ({
  ConnectorsConsole: (props: Record<string, unknown>) => {
    mcpProps.push(props);
    return React.createElement("div", { "data-testid": "mcp-console" });
  },
}));

describe("management page shells", () => {
  beforeEach(() => {
    navigate.mockClear();
    mcpProps.length = 0;
  });

  it("keeps the Registry route as a main/feature assembly shell", () => {
    const html = renderToStaticMarkup(React.createElement(RegistriesPage));

    expect(html).toContain('<main class="automations-page registries-page">');
    expect(html).toContain('data-testid="registry-console"');
  });

  it("adapts MCP route state and preserves query parameters on navigation", () => {
    const html = renderToStaticMarkup(React.createElement(ConnectorsPage));
    const props = mcpProps[0] as {
      routeId: string;
      onRouteIdChange: (connectorId: string) => void;
    };

    expect(html).toContain('<main class="automations-page connectors-page">');
    expect(props.routeId).toBe("server/a");
    props.onRouteIdChange("next/server");
    expect(navigate).toHaveBeenCalledWith(
      "/connectors/next%2Fserver?lang=zh-CN&theme=dark",
    );
  });
});

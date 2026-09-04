import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { McpServersPage } from "@/app/pages/mcp-servers";
import { RegistriesPage } from "@/app/pages/registries";

const navigate = jest.fn();
const mcpProps: Array<Record<string, unknown>> = [];

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ search: "?lang=zh-CN&theme=dark" }),
  useNavigate: () => navigate,
  useParams: () => ({ serverKey: "server/a" }),
}));

jest.mock("@/features/registries/components/RegistryConsole", () => ({
  RegistryConsole: () =>
    React.createElement("div", { "data-testid": "registry-console" }),
}));

jest.mock("@/features/registries/components/McpServersConsole", () => ({
  McpServersConsole: (props: Record<string, unknown>) => {
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
    const html = renderToStaticMarkup(React.createElement(McpServersPage));
    const props = mcpProps[0] as {
      routeServerKey: string;
      onRouteServerKeyChange: (serverKey: string) => void;
    };

    expect(html).toContain('<main class="automations-page mcp-servers-page">');
    expect(props.routeServerKey).toBe("server/a");
    props.onRouteServerKeyChange("next/server");
    expect(navigate).toHaveBeenCalledWith(
      "/mcp-servers/next%2Fserver?lang=zh-CN&theme=dark",
    );
  });
});

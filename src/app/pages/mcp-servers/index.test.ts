import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  McpServersPage,
  createMcpServerTemplate,
  defaultMcpServerFileName,
  mcpServerCardSecondaryKey,
  mcpServerCardTitle,
  mcpServersRoutePath,
} from "@/app/pages/mcp-servers";
import type { AdminRegistryListItem } from "@/shared/data";
import { I18nProvider } from "@/shared/i18n";

const navigateMock = jest.fn();

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ search: "?lang=zh-CN" }),
  useNavigate: () => navigateMock,
  useParams: () => ({ serverKey: "" }),
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
    Dropdown: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Input,
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/shared/data", () => ({
  getAdminRegistries: jest.fn(),
  getAdminSource: jest.fn(),
  getAdminTools: jest.fn(),
  updateAdminSource: jest.fn(),
  validateAdminRegistry: jest.fn(),
}));

describe("McpServersPage", () => {
  it("renders a connector-focused shell with an unassigned tools entry", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(McpServersPage),
      ),
    );

    expect(html).toContain("搜索名称、serverKey 或地址");
    expect(html).toContain("未归属工具");
    expect(html).toContain("请选择或新建 MCP 连接器");
    expect(html).not.toContain("供应商");
    expect(html).not.toContain("视口服务器");
  });

  it("creates collision-free MCP YAML drafts", () => {
    const file = defaultMcpServerFileName([
      {
        category: "mcp-servers",
        file: "new-mcp-server.yml",
        status: "ready",
      },
    ]);

    expect(file).toBe("new-mcp-server-2.yml");
    expect(createMcpServerTemplate(file)).toContain("serverKey: new-mcp-server-2");
    expect(createMcpServerTemplate(file)).toContain('endpointPath: "/mcp"');
  });

  it("builds encoded detail routes while preserving query parameters", () => {
    expect(mcpServersRoutePath("server/a", "?lang=zh-CN")).toBe(
      "/mcp-servers/server%2Fa?lang=zh-CN",
    );
    expect(mcpServersRoutePath("", "lang=en-US")).toBe(
      "/mcp-servers?lang=en-US",
    );
  });

  it("hides a duplicate serverKey while preserving distinct connector identity", () => {
    const duplicateIdentity: AdminRegistryListItem = {
      category: "mcp-servers",
      file: "agenticshelf.yml",
      key: "agenticshelf",
      name: " agenticshelf ",
      status: "ready",
      summary: { serverKey: "agenticshelf" },
    };
    const distinctIdentity: AdminRegistryListItem = {
      ...duplicateIdentity,
      name: "Agentic Shelf",
    };

    expect(mcpServerCardTitle(duplicateIdentity)).toBe("agenticshelf");
    expect(mcpServerCardSecondaryKey(duplicateIdentity)).toBe("");
    expect(mcpServerCardTitle(distinctIdentity)).toBe("Agentic Shelf");
    expect(mcpServerCardSecondaryKey(distinctIdentity)).toBe("agenticshelf");
  });

  it("falls back from a missing name to key and then serverKey", () => {
    const keyFallback: AdminRegistryListItem = {
      category: "mcp-servers",
      file: "fallback.yml",
      key: "fallback-key",
      status: "ready",
      summary: { serverKey: "fallback-server" },
    };
    const serverKeyFallback: AdminRegistryListItem = {
      ...keyFallback,
      key: "",
    };

    expect(mcpServerCardTitle(keyFallback)).toBe("fallback-key");
    expect(mcpServerCardSecondaryKey(keyFallback)).toBe("fallback-server");
    expect(mcpServerCardTitle(serverKeyFallback)).toBe("fallback-server");
    expect(mcpServerCardSecondaryKey(serverKeyFallback)).toBe("");
  });
});

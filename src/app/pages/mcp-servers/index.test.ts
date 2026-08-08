import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  McpServersPage,
  readMcpSyncDiagnostic,
  readMcpToolSyncStatus,
  createMcpServerTemplate,
  defaultMcpServerFileName,
  fetchMcpCatalogSnapshot,
  isMcpServerSaveDisabled,
  MCP_SERVER_FORM_SECTION_IDS,
  mcpServerCardSecondaryKey,
  mcpServerCardTitle,
  mcpServersRoutePath,
  resolveActiveMcpServerFormSection,
  resolveMcpServerDisplayStatus,
  selectMcpServerAfterDelete,
  shouldLoadMcpServerDirectly,
} from "@/app/pages/mcp-servers";
import {
  buildMcpServerDefinition,
  mcpServerFormFromDefinition,
  resolvedMcpServerUrl,
  stringifyMcpServerYaml,
} from "@/features/registries/lib/mcpServerForm";
import type { AdminRegistryListItem } from "@/shared/data";
import { getAdminRegistries, getAdminTools } from "@/shared/data";
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
    Popconfirm: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Select: (props: any) => React.createElement("select", props),
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Switch: (props: any) => React.createElement("input", { ...props, type: "checkbox" }),
  };
});

jest.mock("@/shared/data", () => ({
  getAdminRegistries: jest.fn(),
  getAdminSource: jest.fn(),
  getAdminTools: jest.fn(),
  deleteAdminSource: jest.fn(),
  updateAdminSource: jest.fn(),
  validateAdminRegistry: jest.fn(),
}));

describe("McpServersPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the standalone management page layout contract", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "en-US", persistLocale: false },
        React.createElement(McpServersPage),
      ),
    );

    expect(html).toContain("management-page-console");
    expect(html).not.toContain("command-modal-section");
  });

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

  it("selects the next connector after deletion and falls back to the previous one", () => {
    const previousItems: AdminRegistryListItem[] = ["alpha", "beta", "gamma"].map(
      (key) => ({
        category: "mcp-servers",
        file: `${key}.yml`,
        key,
        status: "ready",
      }),
    );

    expect(
      selectMcpServerAfterDelete(
        previousItems,
        [previousItems[0], previousItems[2]],
        "beta.yml",
      ),
    ).toBe(previousItems[2]);
    expect(
      selectMcpServerAfterDelete(
        previousItems,
        [previousItems[0], previousItems[1]],
        "gamma.yml",
      ),
    ).toBe(previousItems[1]);
    expect(selectMcpServerAfterDelete(previousItems, [], "alpha.yml")).toBeNull();
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

  it("distinguishes MCP runtime sync states from registry validity", () => {
    expect(readMcpToolSyncStatus({ syncStatus: "syncing", toolCount: 0 })).toBe(
      "syncing",
    );
    expect(readMcpToolSyncStatus({ syncStatus: "unavailable", toolCount: 18 })).toBe(
      "unavailable",
    );
    expect(readMcpToolSyncStatus({ toolCount: 0 })).toBe("ready");
    expect(readMcpToolSyncStatus(undefined)).toBe("pending");
    expect(
      readMcpSyncDiagnostic({
        syncDiagnostic: {
          severity: "error",
          code: "mcp_sync_failed",
          message: "connection refused",
        },
      }),
    ).toEqual({
      severity: "error",
      code: "mcp_sync_failed",
      message: "connection refused",
    });
  });

  it.each([
    ["invalid", "ready", { kind: "registry", status: "invalid" }],
    ["disabled", "ready", { kind: "registry", status: "disabled" }],
    ["ready", "pending", { kind: "sync", status: "pending" }],
    ["ready", "syncing", { kind: "sync", status: "syncing" }],
    ["ready", "ready", { kind: "sync", status: "ready" }],
    ["ready", "unavailable", { kind: "sync", status: "unavailable" }],
  ] as const)(
    "resolves %s registry and %s sync status to one display status",
    (registryStatus, syncStatus, expected) => {
      expect(
        resolveMcpServerDisplayStatus(registryStatus, syncStatus),
      ).toEqual(expected);
    },
  );

  it("refreshes registry summaries and tool definitions as one catalog snapshot", async () => {
    const registryMock = getAdminRegistries as jest.Mock;
    const toolsMock = getAdminTools as jest.Mock;
    registryMock.mockResolvedValueOnce({
      data: {
        items: [
          { category: "providers", file: "provider.yml", status: "ready" },
          {
            category: "mcp-servers",
            file: "demo.yml",
            key: "demo",
            status: "ready",
          },
        ],
      },
    });
    toolsMock.mockResolvedValueOnce({
      data: [{ key: "lookup", name: "lookup", sourceCategory: "mcp" }],
    });

    await expect(fetchMcpCatalogSnapshot()).resolves.toEqual({
      items: [
        {
          category: "mcp-servers",
          file: "demo.yml",
          key: "demo",
          status: "ready",
        },
      ],
      tools: [{ key: "lookup", name: "lookup", sourceCategory: "mcp" }],
    });
    expect(registryMock).toHaveBeenCalledTimes(1);
    expect(toolsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps save available for a loaded connector even before the draft changes", () => {
    expect(
      isMcpServerSaveDisabled({
        hasDetail: true,
        detailLoading: false,
        saving: false,
        validating: false,
      }),
    ).toBe(false);
    expect(
      isMcpServerSaveDisabled({
        hasDetail: true,
        detailLoading: false,
        saving: true,
        validating: false,
      }),
    ).toBe(true);
    expect(
      isMcpServerSaveDisabled({
        hasDetail: false,
        detailLoading: false,
        saving: false,
        validating: false,
      }),
    ).toBe(true);
  });

  it("assigns one detail-loading owner for each connector selection", () => {
    expect(
      shouldLoadMcpServerDirectly({
        currentRouteKey: "alpha",
        dirty: false,
        newDraft: false,
        selectedItemKey: "mcp-servers/alpha.yml",
        targetItemKey: "mcp-servers/beta.yml",
        targetRouteKey: "beta",
      }),
    ).toBe(false);
    expect(
      shouldLoadMcpServerDirectly({
        currentRouteKey: "alpha",
        dirty: false,
        newDraft: false,
        selectedItemKey: "mcp-servers/alpha.yml",
        targetItemKey: "mcp-servers/alpha.yml",
        targetRouteKey: "alpha",
      }),
    ).toBe(true);
    expect(
      shouldLoadMcpServerDirectly({
        currentRouteKey: "",
        dirty: true,
        newDraft: true,
        selectedItemKey: "mcp-servers/new.yml",
        targetItemKey: "mcp-servers/alpha.yml",
        targetRouteKey: "alpha",
      }),
    ).toBe(true);
    expect(
      shouldLoadMcpServerDirectly({
        currentRouteKey: "shared-key",
        dirty: false,
        newDraft: false,
        selectedItemKey: "mcp-servers/alpha.yml",
        targetItemKey: "mcp-servers/beta.yml",
        targetRouteKey: "shared-key",
      }),
    ).toBe(true);
  });

  it("maps parsed MCP YAML into a structured form and resolves the final endpoint", () => {
    const form = mcpServerFormFromDefinition({
      serverKey: "aarna-atars",
      baseUrl: "https://mcp.aarna.ai",
      endpointPath: "/mcp",
      enabled: true,
      headers: { Authorization: "Bearer secret" },
      "read-timeout": 60,
    });

    expect(form.serverKey).toBe("aarna-atars");
    expect(form.headersText).toBe("Authorization=Bearer secret");
    expect(form.readTimeout).toBe("60");
    expect(resolvedMcpServerUrl(form)).toBe("https://mcp.aarna.ai/mcp");
  });

  it("builds canonical YAML while preserving source-only advanced fields", () => {
    const base = {
      serverKey: "demo",
      baseUrl: "http://old.example",
      tools: [{ name: "lookup", description: "Static override" }],
      extensionConfig: { enabled: true },
    };
    const form = {
      ...mcpServerFormFromDefinition(base),
      baseUrl: "https://mcp.example.com/mcp/",
      endpointPath: "/tools",
      aliasMapText: "remote=local",
    };
    const definition = buildMcpServerDefinition(form, base);
    const yaml = stringifyMcpServerYaml(definition);

    expect(definition.tools).toEqual(base.tools);
    expect(definition.extensionConfig).toEqual(base.extensionConfig);
    expect(definition.baseUrl).toBe("https://mcp.example.com/mcp");
    expect(definition.aliasMap).toEqual({ remote: "local" });
    expect(yaml).toContain('serverKey: "demo"');
    expect(yaml).toContain('name: "lookup"');
  });

  it("removes fields from the inactive transport", () => {
    const form = {
      ...mcpServerFormFromDefinition({
        serverKey: "stdio-demo",
        baseUrl: "https://old.example",
      }),
      transport: "stdio" as const,
      command: "mcp-demo",
      argsText: "serve\n--stdio",
      envText: "TOKEN=secret",
    };
    const definition = buildMcpServerDefinition(form, {
      serverKey: "stdio-demo",
      baseUrl: "https://old.example",
      endpointPath: "/mcp",
      headers: { Legacy: "true" },
    });

    expect(definition).not.toHaveProperty("baseUrl");
    expect(definition).not.toHaveProperty("endpointPath");
    expect(definition).not.toHaveProperty("headers");
    expect(definition.args).toEqual(["serve", "--stdio"]);
    expect(definition.env).toEqual({ TOKEN: "secret" });
  });

  it("tracks the active anchor and pins the tools section at the bottom", () => {
    expect(resolveActiveMcpServerFormSection([20, 80, 140, 200, 260], 150, false)).toBe(
      MCP_SERVER_FORM_SECTION_IDS[2],
    );
    expect(resolveActiveMcpServerFormSection([20, 80, 140, 200, 260], 30, true)).toBe(
      MCP_SERVER_FORM_SECTION_IDS[4],
    );
  });
});

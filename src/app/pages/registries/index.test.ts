import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RegistriesPage,
  filterRegistryItems,
  listItemOwnerLabel,
  normalizeToolToSummary,
  readToolKind,
  readToolSourceCategory,
  registryCapabilityChips,
  registryListMeta,
  registryListTitle,
  registryItemKey,
  summaryLine,
  toolListMeta,
  toolListOwnerLabel,
  toolSearchHaystack,
  toolSourceLabel,
  registryDetailToListItem,
} from "@/app/pages/registries";
import type {
  AdminRegistryListItem,
  AdminToolSummary,
} from "@/shared/data";
import { I18nProvider, type Locale } from "@/shared/i18n";

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
    Select: ({ options = [], ...props }: any) =>
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
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/shared/data", () => ({
  getAdminRegistries: jest.fn(),
  getAdminRegistryDetail: jest.fn(),
  saveAdminRegistryDetail: jest.fn(),
  validateAdminRegistry: jest.fn(),
  getAdminTools: jest.fn().mockResolvedValue({ status: 200, code: 0, msg: "ok", data: [] }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGetAdminTools = (require("@/shared/data") as any).getAdminTools as jest.Mock;
const translate = (key: string, params?: Record<string, unknown>) => {
  if (key === "registryConsole.meta.toolsCount") return `Tools ${String(params?.count ?? "")}`;
  return key;
};
const zhToolTranslate = (key: string) => {
  const messages: Record<string, string> = {
    "toolSource.platform": "内置",
    "toolSource.external": "扩展",
    "toolSource.mcp": "MCP",
  };
  return messages[key] ?? key;
};

const registryItems: AdminRegistryListItem[] = [
  {
    category: "providers",
    file: "openai.yml",
    key: "openai",
    name: "OpenAI",
    status: "ready",
    summary: { key: "openai", baseUrl: "https://api.openai.com" },
  },
  {
    category: "models",
    file: "broken-model.yml",
    key: "broken-model",
    name: "Broken Model",
    status: "invalid",
    diagnostic: { severity: "error", code: "unknown_provider", message: "Unknown provider missing" },
    diagnosticCount: 1,
    summary: {
      key: "broken-model",
      provider: "missing",
      protocol: "OPENAI",
      type: "image-generation",
      isVision: true,
      isReasoner: true,
      isFunction: false,
    },
  },
  {
    category: "mcp-servers",
    file: "disabled-mcp.yml",
    key: "disabled-mcp",
    status: "disabled",
    summary: { baseUrl: "http://localhost:11969", toolCount: 2 },
  },
  {
    category: "viewport-servers",
    file: "preview.yml",
    key: "preview",
    status: "ready",
    summary: { baseUrl: "http://localhost:11970" },
  },
];

function renderRegistriesPage(locale: Locale) {
  mockGetAdminTools.mockResolvedValue({ status: 200, code: 0, msg: "ok", data: [] });
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale, persistLocale: false },
      React.createElement(RegistriesPage),
    ),
  );
}

describe("RegistriesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdminTools.mockResolvedValue({ status: 200, code: 0, msg: "ok", data: [] });
  });

  it("renders the registry console shell in Chinese", () => {
    const html = renderRegistriesPage("zh-CN");

    expect(html).toContain("搜索 registry 配置");
    expect(html).toContain("供应商");
    expect(html).toContain("模型");
    expect(html).not.toContain("全部分类");
    expect(html).toContain("全部状态");
    expect(html).toContain("新建");
    expect(html).toContain("请选择或新建 registry 配置");
  });

  it("renders the registry console shell in English", () => {
    const html = renderRegistriesPage("en-US");

    expect(html).toContain("Search registry configs");
    expect(html).toContain("Providers");
    expect(html).toContain("Models");
    expect(html).not.toContain("All categories");
    expect(html).toContain("All statuses");
    expect(html).toContain("Select or create a registry config");
  });

  it("renders the tools tab label in Chinese", () => {
    const html = renderRegistriesPage("zh-CN");
    expect(html).toContain("工具");
  });

  it("renders the tools tab label in English", () => {
    const html = renderRegistriesPage("en-US");
    expect(html).toContain("Tools");
  });

  it("filters registry items by category, status, summary, and diagnostic", () => {
    expect(registryItemKey(registryItems[0])).toBe("providers/openai.yml");
    expect(summaryLine({ key: "openai", protocols: ["OPENAI", "ANTHROPIC"] })).toBe(
      "key: openai · protocols: OPENAI, ANTHROPIC",
    );

    expect(
      filterRegistryItems(registryItems, { categoryFilter: "models" }).map(registryItemKey),
    ).toEqual(["models/broken-model.yml"]);
    expect(
      filterRegistryItems(registryItems, {
        categoryFilter: "providers",
        searchText: "unknown provider",
      }).map(registryItemKey),
    ).toEqual([]);
    expect(
      filterRegistryItems(registryItems, { statusFilter: "disabled" }).map(registryItemKey),
    ).toEqual(["mcp-servers/disabled-mcp.yml"]);
    expect(
      filterRegistryItems(registryItems, { searchText: "unknown provider" }).map(registryItemKey),
    ).toEqual(["models/broken-model.yml"]);
    expect(
      filterRegistryItems(registryItems, { searchText: "api.openai" }).map(registryItemKey),
    ).toEqual(["providers/openai.yml"]);
    expect(
      filterRegistryItems(registryItems, { searchText: "image" }).map(registryItemKey),
    ).toEqual(["models/broken-model.yml"]);
    expect(
      filterRegistryItems(registryItems, { searchText: "tools 2" }).map(registryItemKey),
    ).toEqual(["mcp-servers/disabled-mcp.yml"]);
    expect(
      filterRegistryItems(registryItems, { searchText: "工具 2" }).map(registryItemKey),
    ).toEqual(["mcp-servers/disabled-mcp.yml"]);
  });

  it("formats registry list titles, metadata, and model capability chips by category", () => {
    expect(registryListTitle(registryItems[0])).toBe("openai");
    expect(listItemOwnerLabel(registryItems[0], false, translate)).toBe("");
    expect(registryListMeta(registryItems[0], translate)).toBe("https://api.openai.com");

    expect(registryListTitle(registryItems[1])).toBe("Broken Model");
    expect(listItemOwnerLabel(registryItems[1], false, translate)).toBe("");
    expect(registryListMeta(registryItems[1], translate)).toBe("missing · OPENAI · image");
    expect(registryCapabilityChips(registryItems[1]).map((chip) => chip.key)).toEqual([
      "vision",
      "reasoner",
    ]);

    expect(registryListTitle(registryItems[2])).toBe("disabled-mcp");
    expect(listItemOwnerLabel(registryItems[2], false, translate)).toBe("");
    expect(registryListMeta(registryItems[2], translate)).toBe("http://localhost:11969 · Tools 2");

    expect(registryListTitle(registryItems[3])).toBe("preview");
    expect(listItemOwnerLabel(registryItems[3], false, translate)).toBe("");
    expect(registryListMeta(registryItems[3], translate)).toBe("http://localhost:11970");
    expect(registryCapabilityChips(registryItems[3])).toEqual([]);
  });

  it("maps registry detail responses back to slim list items", () => {
    expect(
      registryDetailToListItem({
        category: "models",
        file: "broken-model.yml",
        key: "broken-model",
        name: "Broken Model",
        status: "invalid",
        source: { kind: "models", path: "/runtime/registries/models/broken-model.yml" },
        diagnostics: [
          {
            severity: "error",
            code: "unknown_provider",
            message: "Unknown provider missing",
            sourcePath: "/runtime/registries/models/broken-model.yml",
          },
        ],
        summary: { provider: "missing" },
        updatedAt: 1710000000000,
        size: 512,
      }),
    ).toEqual({
      category: "models",
      file: "broken-model.yml",
      key: "broken-model",
      name: "Broken Model",
      status: "invalid",
      diagnostic: {
        severity: "error",
        code: "unknown_provider",
        message: "Unknown provider missing",
      },
      diagnosticCount: 1,
      summary: { provider: "missing" },
      updatedAt: 1710000000000,
    });
  });

  it("normalizes tool summaries from current sourceCategory and meta.kind fields only", () => {
    const tool = {
      key: "remote_tool",
      name: "Remote Tool",
      description: "Remote MCP tool",
      sourceCategory: "mcp",
      meta: { kind: "backend", sourceType: "mcp" },
      tags: ["remote"],
    };

    expect(readToolSourceCategory(tool)).toBe("mcp");
    expect(readToolKind(tool)).toBe("backend");
    expect(toolSourceLabel("mcp", translate)).toBe("toolSource.mcp");
    expect(toolSourceLabel("external", zhToolTranslate)).toBe("扩展");

    const summary = normalizeToolToSummary(tool);
    expect(summary.summary).toMatchObject({
      sourceCategory: "mcp",
      kind: "backend",
      description: "Remote MCP tool",
      tags: ["remote"],
    });
    expect(toolSearchHaystack(tool)).toContain("mcp");
    expect(toolSearchHaystack(tool)).toContain("backend");

    const legacyOnly = {
      key: "legacy_tool",
      name: "Legacy Tool",
      kind: "frontend",
      source: "platform",
    } as unknown as AdminToolSummary;
    expect(readToolSourceCategory(legacyOnly)).toBe("");
    expect(readToolKind(legacyOnly)).toBe("");
    expect(toolSearchHaystack(legacyOnly)).not.toContain("frontend");
    expect(toolSearchHaystack(legacyOnly)).not.toContain("platform");
  });

  it("formats tools list owner labels from sourceCategory without repeating source in metadata", () => {
    const platformTool = normalizeToolToSummary({
      key: "builtin_datetime",
      name: "Datetime",
      sourceCategory: "platform",
      meta: { kind: "backend" },
    });
    const mcpTool = normalizeToolToSummary({
      key: "remote_search",
      name: "Remote Search",
      sourceCategory: "mcp",
      meta: { kind: "backend" },
    });
    const extensionTool = normalizeToolToSummary({
      key: "extension_tool",
      name: "Extension Tool",
      sourceCategory: "external",
      meta: { kind: "frontend" },
    });
    const customTool = normalizeToolToSummary({
      key: "custom_tool",
      name: "Custom Tool",
      sourceCategory: "custom",
      meta: { kind: "backend" },
    });
    const noSourceTool = normalizeToolToSummary({
      key: "unknown_tool",
      name: "Unknown Tool",
      meta: { kind: "backend" },
    });

    expect(toolListOwnerLabel(platformTool, zhToolTranslate)).toBe("内置");
    expect(toolListOwnerLabel(mcpTool, zhToolTranslate)).toBe("MCP");
    expect(toolListOwnerLabel(extensionTool, zhToolTranslate)).toBe("扩展");
    expect(toolListOwnerLabel(customTool, zhToolTranslate)).toBe("custom");
    expect(toolListOwnerLabel(noSourceTool, zhToolTranslate)).toBe("");
    expect(listItemOwnerLabel(platformTool, true, zhToolTranslate)).toBe("内置");

    expect(toolListMeta(platformTool)).toBe("builtin_datetime · backend");
    expect(toolListMeta(mcpTool)).toBe("remote_search · backend");
    expect(toolListMeta(extensionTool)).toBe("extension_tool · frontend");
    expect(toolListMeta(platformTool)).not.toContain("内置");
    expect(toolListMeta(mcpTool)).not.toContain("MCP");
    expect(toolListMeta(extensionTool)).not.toContain("扩展");
  });
});

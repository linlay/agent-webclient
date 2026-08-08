import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RegistriesPage,
  filterRegistryItems,
  listItemOwnerLabel,
  normalizeToolToSummary,
  readToolKind,
  readToolSourceCategory,
  readToolSourceType,
  registryCapabilityChips,
  RegistryCapabilityIconTag,
  registryDetailToListItem,
  registryItemKey,
  registryListMeta,
  registryListTitle,
  summaryLine,
  toolListMeta,
  toolListOwnerLabel,
  toolSearchHaystack,
  toolSourceLabel,
} from "@/app/pages/registries";
import type { AdminRegistryListItem, AdminToolSummary } from "@/shared/data";
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
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/shared/data", () => ({
  getAdminRegistries: jest.fn(),
  getAdminSource: jest.fn(),
  updateAdminSource: jest.fn(),
  validateAdminRegistry: jest.fn(),
  getAdminTools: jest.fn().mockResolvedValue({ status: 200, code: 0, msg: "ok", data: [] }),
}));

const translate = (key: string) => key;
const zhToolTranslate = (key: string) => {
  const messages: Record<string, string> = {
    "toolSource.platform": "内置",
    "toolSource.external": "外部",
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
    category: "viewport-servers",
    file: "preview.yml",
    key: "preview",
    status: "ready",
    summary: { baseUrl: "http://localhost:11970" },
  },
];

function renderRegistriesPage(locale: Locale) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale, persistLocale: false },
      React.createElement(RegistriesPage),
    ),
  );
}

describe("RegistriesPage", () => {
  it("uses the standalone management page layout contract", () => {
    const html = renderRegistriesPage("en-US");

    expect(html).toContain("management-page-console");
    expect(html).toContain("280px_minmax(0,1fr)");
    expect(html).not.toContain("command-modal-section");
  });

  it("renders the non-MCP registry console in Chinese", () => {
    const html = renderRegistriesPage("zh-CN");

    expect(html).toContain("搜索 registry 配置");
    expect(html).toContain("供应商");
    expect(html).toContain("模型");
    expect(html).toContain("视口服务器");
    expect(html).toContain("工具");
    expect(html).not.toContain("MCP 服务器");
    expect(html).not.toContain("MCP 连接器");
    expect(html).toContain("全部状态");
    expect(html).toContain("请选择或新建 registry 配置");
  });

  it("renders the non-MCP registry console in English", () => {
    const html = renderRegistriesPage("en-US");

    expect(html).toContain("Search registry configs");
    expect(html).toContain("Providers");
    expect(html).toContain("Models");
    expect(html).toContain("Viewport Servers");
    expect(html).toContain("Tools");
    expect(html).not.toContain("MCP Servers");
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
      filterRegistryItems(registryItems, { searchText: "unknown provider" }).map(registryItemKey),
    ).toEqual(["models/broken-model.yml"]);
    expect(
      filterRegistryItems(registryItems, { searchText: "api.openai" }).map(registryItemKey),
    ).toEqual(["providers/openai.yml"]);
  });

  it("formats registry list metadata and model capability chips", () => {
    expect(registryListTitle(registryItems[0])).toBe("openai");
    expect(registryListMeta(registryItems[0], translate)).toBe("https://api.openai.com");
    expect(registryListTitle(registryItems[1])).toBe("Broken Model");
    expect(registryListMeta(registryItems[1], translate)).toBe("missing · OPENAI · image");
    expect(registryCapabilityChips(registryItems[1]).map((chip) => chip.key)).toEqual([
      "vision",
      "reasoner",
    ]);
    expect(registryListTitle(registryItems[2])).toBe("preview");
    expect(registryListMeta(registryItems[2], translate)).toBe("http://localhost:11970");
  });

  it("renders model capability chips as accessible icon-only tags", () => {
    const chip = registryCapabilityChips(registryItems[1])[0];
    const html = renderToStaticMarkup(
      React.createElement(RegistryCapabilityIconTag, { chip, label: "视觉" }),
    );

    expect(html).toContain('aria-label="视觉"');
    expect(html).toContain('title="视觉"');
    expect(html).toContain('data-material-icon="visibility"');
    expect(html).not.toContain(">视觉<");
  });

  it("maps registry detail responses back to slim list items", () => {
    expect(
      registryDetailToListItem({
        category: "models",
        file: "broken-model.yml",
        key: "broken-model",
        name: "Broken Model",
        status: "invalid",
        diagnostics: [
          { severity: "error", code: "unknown_provider", message: "Unknown provider missing" },
        ],
        summary: { provider: "missing" },
        updatedAt: 1710000000000,
      }),
    ).toMatchObject({
      category: "models",
      file: "broken-model.yml",
      diagnosticCount: 1,
      summary: { provider: "missing" },
    });
  });

  it("normalizes current flat non-MCP tool fields", () => {
    const tool: AdminToolSummary = {
      key: "builtin_datetime",
      name: "Datetime",
      description: "Current time",
      sourceCategory: "platform",
      sourceType: "local",
      kind: "backend",
    };

    expect(readToolSourceCategory(tool)).toBe("platform");
    expect(readToolSourceType(tool)).toBe("local");
    expect(readToolKind(tool)).toBe("backend");
    expect(toolSourceLabel("external", zhToolTranslate)).toBe("外部");
    expect(normalizeToolToSummary(tool).summary).toMatchObject({
      sourceCategory: "platform",
      sourceType: "local",
      kind: "backend",
      description: "Current time",
    });
    expect(toolSearchHaystack(tool)).toContain("datetime");
    expect(toolSearchHaystack(tool)).toContain("backend");
  });

  it("formats non-MCP tool owner labels without repeating localized source text", () => {
    const platformTool = normalizeToolToSummary({
      key: "builtin_datetime",
      name: "Datetime",
      sourceCategory: "platform",
      sourceType: "local",
      kind: "backend",
    });
    const extensionTool = normalizeToolToSummary({
      key: "extension_tool",
      name: "Extension Tool",
      sourceCategory: "external",
      sourceType: "agent-local",
      kind: "frontend",
    });

    expect(toolListOwnerLabel(platformTool, zhToolTranslate)).toBe("内置");
    expect(toolListOwnerLabel(extensionTool, zhToolTranslate)).toBe("外部");
    expect(listItemOwnerLabel(platformTool, true, zhToolTranslate)).toBe("内置");
    expect(toolListMeta(platformTool)).toBe("builtin_datetime · local · platform · backend");
    expect(toolListMeta(extensionTool)).toBe("extension_tool · agent-local · external · frontend");
    expect(toolListMeta(platformTool)).not.toContain("内置");
  });
});

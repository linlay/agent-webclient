import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RegistriesPage,
  filterRegistryItems,
  registryItemKey,
  summaryLine,
} from "@/app/pages/registries";
import type { AdminRegistrySummary } from "@/shared/api/apiClient";
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

jest.mock("@/shared/api/apiClient", () => ({
  getAdminRegistries: jest.fn(),
  getAdminRegistryDetail: jest.fn(),
  saveAdminRegistryDetail: jest.fn(),
  validateAdminRegistry: jest.fn(),
}));

const registryItems: AdminRegistrySummary[] = [
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
    status: "invalid",
    diagnostics: [
      { severity: "error", code: "unknown_provider", message: "Unknown provider missing" },
    ],
    summary: { key: "broken-model", provider: "missing" },
  },
  {
    category: "mcp-servers",
    file: "disabled-mcp.yml",
    key: "disabled-mcp",
    status: "disabled",
    summary: { baseUrl: "http://localhost:11969" },
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
  it("renders the registry console shell in Chinese", () => {
    const html = renderRegistriesPage("zh-CN");

    expect(html).toContain("搜索 registry 配置");
    expect(html).toContain("Providers");
    expect(html).toContain("Models");
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

  it("filters registry items by category, status, summary, and diagnostics", () => {
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
  });
});

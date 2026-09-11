/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { AdminToolSummary } from "@/shared/data";
import { I18nProvider } from "@/shared/i18n";
import { ConnectorTools } from "./ConnectorComponents";

it("renders readable tool names once and searches a large snapshot by name or description", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const tools: AdminToolSummary[] = Array.from({ length: 10 }, (_, index) => ({
    key: `mcp_0006cb5d2c648af7_sheet_${index}`,
    name: `mcp_0006cb5d2c648af7_sheet_${index}`,
    mcpToolName: index === 0 ? "sheet_unset_freeze" : `sheet_${index}`,
    description: index === 0 ? "删除所有冻结行列" : "读取表格",
    sourceCategory: "mcp", sourceType: "mcp", kind: "backend",
  }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, React.createElement(ConnectorTools, { tools }))));
    expect(container.querySelectorAll("strong")).toHaveLength(10);
    expect(container.textContent).not.toContain("mcp_0006cb5d2c648af7");
    expect(container.querySelector("code")).toBeNull();
    const input = container.querySelector("input")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const search = async (value: string) => act(async () => {
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await search("冻结");
    expect(container.querySelectorAll("strong")).toHaveLength(1);
    expect(container.querySelector("strong")?.textContent).toBe("sheet_unset_freeze");
    await search("missing");
    expect(container.textContent).toContain("没有匹配的工具");
    await search("");
    expect(container.querySelectorAll("strong")).toHaveLength(10);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import { I18nProvider } from "@/shared/i18n";
import { createInitialState } from "@/app/state/state";
import { UsageContextControl } from "./UsageContextControl";

const mockDispatch = jest.fn();
let mockState: ReturnType<typeof createInitialState>;

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => mockState,
  useAppDispatch: () => mockDispatch,
  useOptionalAppContext: () => null,
}));
jest.mock("@/features/composer/hooks/useBackgroundCommandActions", () => ({
  useBackgroundCommandActions: () => ({
    submitCompactCommand: jest.fn(),
    submittingCommand: null,
  }),
}));

describe("UsageContextControl metric presentation", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
  });

  beforeEach(() => {
    mockState = {
      ...createInitialState(),
      chatId: "chat-1",
      usagePopoverOpen: true,
      usageSnapshot: {
        type: "usage.snapshot",
        contextWindow: { currentSize: 26_214, maxSize: 262_144 },
        usage: {
          current: {
            promptTokens: 6_000,
            completionTokens: 4_000,
            totalTokens: 10_000,
            promptTokensDetails: { cacheHitTokens: 1_500, cacheMissTokens: 4_500 },
            completionTokensDetails: { reasoningTokens: 800 },
          },
        },
      },
    } as ReturnType<typeof createInitialState>;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderControl = async () => {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "en-US", persistLocale: false },
      React.createElement(ConfigProvider, { theme: { tokens: { motion: false } } },
        React.createElement(AntdApp, null, React.createElement(UsageContextControl)),
      ),
    )));
  };

  const metricCell = (label: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(".usage-metric")).find(
      (cell) => cell.querySelector(".usage-metric-label")?.textContent === label,
    );

  it("shows two stacked bars with reasoning excluded from blue output", async () => {
    await renderControl();
    const section = metricCell("In")!.closest("section")!;
    expect(section.querySelectorAll("[data-segment]")).toHaveLength(5);
    const width = (key: string) => section.querySelector<HTMLElement>(`[data-segment="${key}"]`)!.style.width;
    expect(width("prompt")).toBe("60%");
    expect(width("output")).toBe("32%");
    expect(width("reasoning")).toBe("8%");
    expect(width("cacheHit")).toBe("25%");
    expect(width("cacheMiss")).toBe("75%");
    expect(metricCell("Cache miss")).toBeUndefined();
    expect(section.querySelector<HTMLElement>('[data-segment="cacheHit"]')!.style.background).toBe("rgb(53, 105, 246)");
    const group = section.querySelector<HTMLElement>('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toContain("Total tokens: 10,000");
    expect(group.getAttribute("aria-label")).toContain("Completion tokens: 4,000");
    expect(group.getAttribute("aria-label")).toContain("Of which reasoning tokens: 800");
    await act(async () => {
      group.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    const tooltip = Array.from(document.querySelectorAll('[role="tooltip"]')).find(node => node.textContent?.includes("Total token"));
    expect(tooltip?.textContent).toContain("Total tokens10,000");
    expect(tooltip?.textContent).toContain("Completion − Reasoning tokens3,200");
  });

  it("keeps unknown counts empty rather than inventing zero values", async () => {
    mockState.usageSnapshot = {
      type: "usage.snapshot", usage: { current: { promptTokens: 1200 } },
    } as ReturnType<typeof createInitialState>["usageSnapshot"];
    await renderControl();
    expect(metricCell("In")!.textContent).toContain("1,200");
    expect(metricCell("Rsn")!.textContent).toContain("-");
    expect(document.querySelector<HTMLElement>('[data-segment="output"]')!.style.width).toBe("0%");
  });

  it("omits the context window tooltip when sizes are missing", async () => {
    mockState.usageSnapshot = {
      type: "usage.snapshot",
      usage: { current: { promptTokens: 1_200 } },
    } as ReturnType<typeof createInitialState>["usageSnapshot"];
    await renderControl();

    const copy = document.querySelector<HTMLElement>(".usage-context-copy");
    expect(copy).not.toBeNull();
    expect(copy!.querySelector("strong")?.textContent).toBe("-");
    expect(copy!.dataset.metricValue).toBe("-");
    expect(copy!.closest(".ant-tooltip-open")).toBeNull();
  });

  it("renders only total capacity and exposes precise usage on the ring", async () => {
    await renderControl();

    const copy = document.querySelector<HTMLElement>(".usage-context-copy");
    expect(copy).not.toBeNull();
    expect(copy!.querySelector("strong")?.textContent).toBe("262,144");
    expect(copy!.querySelector(".usage-context-bar")).toBeNull();
    expect(copy!.dataset.metricValue).toBe("262,144");
    expect(copy!.closest(".ant-tooltip-open")).toBeNull();
    const ring = document.querySelector(".usage-context-ring")!;
    expect(ring.getAttribute("aria-label")).toBe("Used: 26,214; Total: 262,144; Percentage: 10.00%");
  });

  it("places a single global toggle beside the close button", async () => {
    await renderControl();
    expect(document.querySelectorAll(".usage-view-toggle")).toHaveLength(1);
    const toggle = document.querySelector(".usage-view-toggle")!;
    expect(toggle.closest("section")).toBeNull();
    expect(toggle.parentElement!.querySelector(".usage-popover-close")).not.toBeNull();
  });

  it("toggles every section together and restores all six raw metrics", async () => {
    await renderControl();
    const toggle = document.querySelector<HTMLButtonElement>(".usage-view-toggle")!;
    await act(async () => toggle.click());
    expect(document.querySelectorAll("[data-segment]")).toHaveLength(0);
    for (const group of Array.from(document.querySelectorAll("section"))) {
      expect(group.querySelectorAll(".usage-metric")).toHaveLength(6);
    }
    expect(metricCell("Total")!.querySelector(".usage-metric-value")!.textContent).toBe("10,000");
    expect(metricCell("Completion")!.querySelector(".usage-metric-value")!.textContent).toBe("4,000");
    expect(metricCell("Reasoning")!.querySelector(".usage-metric-value")!.textContent).toBe("800");
    await act(async () => toggle.click());
    expect(document.querySelectorAll("[data-segment]")).toHaveLength(15);
  });
});

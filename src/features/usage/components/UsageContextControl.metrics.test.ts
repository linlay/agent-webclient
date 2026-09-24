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
      React.createElement(ConfigProvider, { theme: { token: { motion: false } } },
        React.createElement(AntdApp, null, React.createElement(UsageContextControl)),
      ),
    )));
  };

  const metricCell = (label: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(".usage-metric")).find(
      (cell) => cell.querySelector(".usage-metric-label")?.textContent === label,
    );

  it("shows percentages with bars and carries labelled usage/total for the tooltip", async () => {
    await renderControl();

    const promptCell = metricCell("Prompt");
    expect(promptCell).toBeDefined();
    expect(promptCell!.querySelector(".usage-metric-value")?.textContent).toBe("60%");
    expect(
      promptCell!.querySelector<HTMLElement>(".usage-metric-bar-fill")?.style.width,
    ).toBe("60%");
    expect(promptCell!.dataset.metricValue).toBe("6,000 Prompt / 10,000 Total");
    expect(promptCell!.dataset.metricPercent).toBe("60%");

    const totalCells = Array.from(
      document.querySelectorAll<HTMLElement>(".usage-metric"),
    ).filter((cell) => cell.querySelector(".usage-metric-label")?.textContent === "Total");
    expect(totalCells).toHaveLength(0);

    const cacheHitCell = metricCell("Cache hit");
    expect(cacheHitCell!.querySelector(".usage-metric-value")?.textContent).toBe("25%");
    expect(cacheHitCell!.dataset.metricValue).toBe("1,500 Cache hit / 6,000 Prompt");

    const reasoningCell = metricCell("Reasoning");
    expect(reasoningCell!.querySelector(".usage-metric-value")?.textContent).toBe("20%");
    expect(reasoningCell!.dataset.metricValue).toBe("800 Reasoning / 4,000 Completion");
  });

  it("keeps raw numbers in the cell and tooltip when no ratio base exists", async () => {
    mockState.usageSnapshot = {
      type: "usage.snapshot",
      usage: { current: { promptTokens: 1_200 } },
    } as ReturnType<typeof createInitialState>["usageSnapshot"];
    await renderControl();

    const promptCell = metricCell("Prompt");
    expect(promptCell!.querySelector(".usage-metric-value")?.textContent).toBe("1,200");
    expect(promptCell!.dataset.metricValue).toBe("1,200 Prompt");
    expect(promptCell!.dataset.metricPercent).toBe("");
    expect(
      promptCell!.querySelector<HTMLElement>(".usage-metric-bar-fill")?.style.width,
    ).toBe("0%");
  });

  it("omits the tooltip when a metric has no data", async () => {
    mockState.usageSnapshot = {
      type: "usage.snapshot",
      usage: { current: { promptTokens: 1_200 } },
    } as ReturnType<typeof createInitialState>["usageSnapshot"];
    await renderControl();

    const reasoningCell = metricCell("Reasoning");
    expect(reasoningCell!.querySelector(".usage-metric-value")?.textContent).toBe("-");
    const cacheHitCell = metricCell("Cache hit");
    expect(cacheHitCell!.dataset.metricPercent).toBe("");
    [reasoningCell, cacheHitCell].forEach((cell) => {
      const trigger = cell!.closest(".ant-tooltip-open") ?? cell!.parentElement;
      expect(trigger).not.toBeNull();
    });
    expect(reasoningCell!.querySelector(".usage-metric-bar")).toBeNull();
  });

  it("omits the context window tooltip when sizes are missing", async () => {
    mockState.usageSnapshot = {
      type: "usage.snapshot",
      usage: { current: { promptTokens: 1_200 } },
    } as ReturnType<typeof createInitialState>["usageSnapshot"];
    await renderControl();

    const copy = document.querySelector<HTMLElement>(".usage-context-copy");
    expect(copy).not.toBeNull();
    expect(copy!.querySelector("strong")?.textContent).toBe("-- / --");
    expect(copy!.dataset.metricValue).toBe("- / -");
    expect(copy!.closest(".ant-tooltip-open")).toBeNull();
  });

  it("renders the context window as usage/total text without a tooltip", async () => {
    await renderControl();

    const copy = document.querySelector<HTMLElement>(".usage-context-copy");
    expect(copy).not.toBeNull();
    expect(copy!.querySelector("strong")?.textContent).toBe("26,214 / 262,144");
    expect(copy!.querySelector(".usage-context-bar")).toBeNull();
    expect(copy!.dataset.metricValue).toBe("26,214 / 262,144");
    expect(copy!.closest(".ant-tooltip-open")).toBeNull();
  });

  it("omits the section toggle when the section has no metric data", async () => {
    mockState.usageSnapshot = {
      type: "usage.snapshot",
      usage: { current: { promptTokens: 1_200 } },
    } as ReturnType<typeof createInitialState>["usageSnapshot"];
    await renderControl();

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("section"),
    );
    const sectionOf = (label: string) =>
      sections.find(
        (section) =>
          section.querySelector(".usage-metric-label")?.textContent === label,
      ) ?? null;

    const currentSection = sectionOf("Prompt");
    expect(currentSection).not.toBeNull();
    expect(currentSection!.querySelector(".usage-section-toggle")).not.toBeNull();

    const runSection = sections.find(
      (section) => section !== currentSection && section.querySelector("h3"),
    );
    expect(runSection).toBeDefined();
    expect(runSection!.querySelector(".usage-metric-value")?.textContent).toBe(
      "-",
    );
    expect(runSection!.querySelector(".usage-section-toggle")).toBeNull();
  });

  it("toggles each section independently to raw values without bars or tooltips", async () => {
    await renderControl();

    const sectionOf = (label: string) => {
      const cell = metricCell(label);
      return cell?.closest("section") ?? null;
    };
    const sectionToggle = (section: HTMLElement | null) =>
      section?.querySelector<HTMLButtonElement>(".usage-section-toggle") ?? null;

    const currentSection = sectionOf("Prompt");
    expect(currentSection).not.toBeNull();
    expect(sectionOf("Reasoning")).toBe(currentSection);
    const currentToggle = sectionToggle(currentSection);
    expect(currentToggle).not.toBeNull();
    expect(currentToggle!.getAttribute("aria-pressed")).toBe("false");
    expect(currentToggle!.getAttribute("aria-label")).toBe(
      "Switch to value view",
    );
    expect(currentToggle!.closest("section")).toBe(currentSection);

    await act(async () => {
      currentToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(sectionToggle(currentSection)!.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(sectionToggle(currentSection)!.getAttribute("aria-label")).toBe(
      "Switch to bar view",
    );

    const promptCell = metricCell("Prompt");
    expect(promptCell).toBeDefined();
    expect(promptCell!.querySelector(".usage-metric-value")?.textContent).toBe(
      "6,000",
    );
    expect(promptCell!.querySelector(".usage-metric-bar")).toBeNull();
    expect(promptCell!.dataset.metricValue).toBe("6,000 Prompt / 10,000 Total");

    const reasoningCell = metricCell("Reasoning");
    expect(reasoningCell!.querySelector(".usage-metric-value")?.textContent).toBe(
      "800",
    );
    expect(reasoningCell!.querySelector(".usage-metric-bar")).toBeNull();

    const cacheHitCell = metricCell("Cache hit");
    expect(cacheHitCell!.querySelector(".usage-metric-value")?.textContent).toBe(
      "1,500",
    );
    expect(cacheHitCell!.dataset.metricPercent).toBe("25%");
    expect(cacheHitCell!.closest(".ant-tooltip-open")).toBeNull();

    await act(async () => {
      sectionToggle(currentSection)!.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(sectionToggle(currentSection)!.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(promptCell!.querySelector(".usage-metric-value")?.textContent).toBe(
      "60%",
    );
    expect(
      promptCell!.querySelector<HTMLElement>(".usage-metric-bar-fill")?.style
        .width,
    ).toBe("60%");
  });
});

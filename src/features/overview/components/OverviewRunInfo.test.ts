/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OverviewRunInfoSection } from "./OverviewRunInfo";
import { I18nProvider } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";
import type { OverviewRunInfo } from "@/features/overview/lib/overviewRunInfo";

jest.mock("@/shared/utils/copy", () => ({ copyText: jest.fn().mockResolvedValue(undefined) }));

const START = new Date("2026-09-10T06:32:05Z").getTime();
const initialInfo: OverviewRunInfo = {
  chatId: "chat-full-identifier", runId: "run-full-identifier", agent: "Developer", team: "",
  model: "actual-model", reasoning: "high", status: "running", active: true,
  startedAt: START, context: { current: 49000, max: 128000, percent: 38 },
};

describe("overview run disclosure", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START + 32000);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  const render = async (hasContent: boolean, info = initialInfo) => {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "en-US", persistLocale: false },
      React.createElement(OverviewRunInfoSection, { key: info.chatId, info, hasContent }),
    )));
  };
  const toggle = () => container.querySelector<HTMLButtonElement>("button[aria-expanded]")!;

  it("expands without output, then collapses automatically on first output", async () => {
    await render(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    await render(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[hidden]")).not.toBeNull();
  });

  it("respects manual expansion across run changes and resets on chat changes", async () => {
    await render(true);
    await act(async () => toggle().click());
    await render(true, { ...initialInfo, runId: "run-next" });
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    await render(true, { ...initialInfo, chatId: "chat-next" });
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    await render(false, { ...initialInfo, chatId: "chat-empty" });
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps a manual collapse when outputs are removed", async () => {
    await render(false);
    await act(async () => toggle().click());
    await render(true);
    await render(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("updates elapsed time while folded and freezes on completion", async () => {
    await render(true);
    const before = toggle().textContent;
    await act(async () => jest.advanceTimersByTime(3000));
    expect(toggle().textContent).not.toBe(before);
    await render(true, { ...initialInfo, status: "completed", active: false, finishedAt: START + 35000 });
    const completed = toggle().textContent;
    await act(async () => jest.advanceTimersByTime(60000));
    expect(toggle().textContent).toBe(completed);
    expect(completed).toContain("Completed");
  });

  it("exposes the actual model, reasoning and context and copies full identifiers", async () => {
    await render(false);
    expect(container.textContent).toContain("actual-model · high");
    expect(container.textContent).toContain("38%");
    expect(container.querySelector("progress")?.value).toBe(38);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Copy Chat ID"]')!.click());
    expect(copyText).toHaveBeenCalledWith(initialInfo.chatId);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Copy Run ID"]')!.click());
    expect(copyText).toHaveBeenCalledWith(initialInfo.runId);
  });
});

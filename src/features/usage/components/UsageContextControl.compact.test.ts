/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import { I18nProvider } from "@/shared/i18n";
import { createInitialState } from "@/app/state/state";
import { useCompactChooser } from "@/features/composer/hooks/useCompactChooser";
import { AIContextEventTypeEnum as CompactType } from "@/shared/contracts/agentEvents";
import { UsageContextControl } from "./UsageContextControl";

const mockSubmitCompact = jest.fn();
const mockDispatch = jest.fn();
let mockState: ReturnType<typeof createInitialState>;

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => mockState,
  useAppDispatch: () => mockDispatch,
  useOptionalAppContext: () => null,
}));
jest.mock("@/features/composer/hooks/useBackgroundCommandActions", () => ({
  useBackgroundCommandActions: () => ({
    submitCompactCommand: mockSubmitCompact,
    submittingCommand: null,
  }),
}));

function CommandEntry() {
  const open = useCompactChooser(mockSubmitCompact);
  return React.createElement("button", { onClick: open }, "/compact");
}

describe("shared compaction chooser", () => {
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
    jest.useFakeTimers();
    jest.clearAllMocks();
    const getComputedStyle = window.getComputedStyle;
    jest.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
    mockState = {
      ...createInitialState(),
      chatId: "chat-1",
      usagePopoverOpen: true,
      usageSnapshot: {
        type: "usage.snapshot",
        contextWindow: { currentSize: 239009, maxSize: 524288 },
      },
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const render = async (source: "usage" | "command") => {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "en-US", persistLocale: false },
      React.createElement(ConfigProvider, { theme: { token: { motion: false } } },
        React.createElement(AntdApp, null, React.createElement(source === "usage" ? UsageContextControl : CommandEntry)),
      ),
    )));
  };
  const click = async (selector: string) => {
    const button = document.querySelector<HTMLButtonElement>(selector);
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  };
  const open = async (source: "usage" | "command") => {
    await render(source);
    await click(source === "usage" ? '[aria-label="Compact"]' : "button");
  };

  it("opens the recorded stages without submitting a compact request or requiring usage", async () => {
    mockState.usageSnapshot = null;
    mockState.events = [
      { type: CompactType.CompactStart, chatId: "chat-1", compactId: "a", cycleId: "one", level: "l1_tools", trigger: "auto" },
      { type: CompactType.CompactComplete, chatId: "chat-1", compactId: "a", cycleId: "one", estimatedTokens: 72000, currentTokens: 18000 },
      { type: CompactType.CompactStart, chatId: "chat-1", compactId: "a" },
      { type: CompactType.CompactFailed, chatId: "chat-1", compactId: "b", cycleId: "one", level: "summary", error: { message: "Summary timeout" } },
      { type: CompactType.CompactComplete, chatId: "other", compactId: "foreign", currentTokens: 999 },
    ];
    await render("usage");
    const button = [...document.querySelectorAll("button")].find(el => el.textContent?.includes("Compaction history"))!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await act(async () => button.click());
    const rows = document.getElementById(button.getAttribute("aria-controls")!)!.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Summary timeout");
    expect(rows[1].textContent).toContain("75.00% (54,000 tokens)");
    expect(rows[1].textContent).toContain("18,000 tokens");
    expect(rows[1].textContent).toContain("Automatic");
    expect(mockSubmitCompact).not.toHaveBeenCalled();
  });

  it.each(["usage", "command"] as const)("opens the same two choices from %s without submitting", async (source) => {
    await open(source);
    expect(document.querySelector(".ant-modal")?.textContent).toContain("Choose compaction level");
    expect(document.querySelector('[aria-label="Compact tool context (L1)"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Generate history summary (L2)"]')).not.toBeNull();
    expect(mockSubmitCompact).not.toHaveBeenCalled();
    if (source === "usage") {
      expect(mockDispatch).toHaveBeenCalledWith({ type: "SET_USAGE_POPOVER_OPEN", open: false });
    }
  });

  it.each([
    ["Compact tool context (L1)", "l1_tools"],
    ["Generate history summary (L2)", "summary"],
  ])("submits %s once and closes the chooser", async (label, level) => {
    await open("usage");
    const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    await act(async () => { button.click(); button.click(); });
    expect(mockSubmitCompact).toHaveBeenCalledTimes(1);
    expect(mockSubmitCompact).toHaveBeenCalledWith(level);
    await act(async () => jest.runOnlyPendingTimersAsync());
    expect(document.querySelector(".ant-modal")).toBeNull();
  });

  it("closes with the top-right close control without compacting", async () => {
    await open("usage");
    await click(".ant-modal-close");
    await act(async () => jest.runOnlyPendingTimersAsync());
    expect(document.querySelector(".ant-modal")).toBeNull();
    expect(mockSubmitCompact).not.toHaveBeenCalled();
  });

  it("keeps compact disabled without an active chat", async () => {
    mockState.chatId = "";
    await render("usage");
    await click('[aria-label="Compact"]');
    expect(document.querySelector(".ant-modal")).toBeNull();
    expect(mockSubmitCompact).not.toHaveBeenCalled();
  });
});

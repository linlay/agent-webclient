/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MarkdownContent } from "./MarkdownContent";
import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";
import { isAppMode } from "@/shared/utils/routing";

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => jest.fn(),
  useAppState: () => ({ rightSidebarOpen: false, rightSidebarOpenTab: null, activeViewerKey: "" }),
}));
jest.mock("antd", () => ({
  App: { useApp: () => ({ message: { success: jest.fn(), warning: mockWarning } }) },
}));
jest.mock("@/shared/data/desktop/desktopHostBridge", () => ({
  hasDesktopHostBridge: jest.fn(),
  isDesktopHostMessageEvent: jest.fn(),
  postDesktopHostMessage: jest.fn(),
}));
jest.mock("@/shared/utils/routing", () => ({
  ...jest.requireActual("@/shared/utils/routing"),
  isAppMode: jest.fn(),
}));

const mockWarning = jest.fn();
const hasHost = jest.mocked(hasDesktopHostBridge);
const inDesktop = jest.mocked(isAppMode);
const post = jest.mocked(postDesktopHostMessage);
const url = "cutej://navigate?path=%2Fsettings%2Fappearance";
const otherProtocolUrl = "sample.tool+v2:open/42?tab=notes&mode=edit#latest";
type NavigationRequest = { type: string; requestId: string; url: string };

function renderChat(externalProtocolLinks = true, href = url) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const content = `[换皮肤](<${href}>)`;
  flushSync(() => root.render(<MarkdownContent content={content} chatId="test-chat" externalProtocolLinks={externalProtocolLinks} />));
  return {
    container,
    dispose() {
      root.unmount();
      container.remove();
    },
  };
}

function reply(requestId: string, ok: boolean, source: MessageEventSource | null = window) {
  window.dispatchEvent(new MessageEvent("message", {
    source,
    data: { type: "desktop:agent-webclient:external-link:result", requestId, ok, code: ok ? undefined : "unsupported" },
  }));
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  hasHost.mockReturnValue(true);
  inDesktop.mockReturnValue(true);
  post.mockReturnValue(true);
  jest.mocked(isDesktopHostMessageEvent).mockImplementation((event) => event.source === window);
});

afterEach(() => {
  jest.useRealTimers();
});

it.each([url, "zenmind://open", otherProtocolUrl])(
  "preserves %s through sanitization and forwards it only on Desktop activation",
  async (href) => {
    const { container, dispose } = renderChat(true, href);
    try {
      const link = container.querySelector<HTMLButtonElement>('button[role="link"]');
      expect(link?.textContent).toBe("换皮肤");
      expect(container.querySelector("a[href]")).toBeNull();
      expect(post).not.toHaveBeenCalled();
      link!.click();
      const request = post.mock.calls[0][0] as NavigationRequest;
      expect(request).toEqual({
        type: "desktop:agent-webclient:external-link:open",
        requestId: expect.any(String),
        url: href,
      });
      reply("unrelated", false);
      reply(request.requestId, false, null);
      await Promise.resolve();
      expect(mockWarning).not.toHaveBeenCalled();
      reply(request.requestId, true);
      await Promise.resolve();
      expect(mockWarning).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      dispose();
    }
  },
);

it("reports a rejected destination and an unanswered request", async () => {
  const { container, dispose } = renderChat();
  try {
    const link = container.querySelector<HTMLButtonElement>('button[role="link"]')!;
    link.click();
    const request = post.mock.calls[0][0] as NavigationRequest;
    reply(request.requestId, false);
    await Promise.resolve();
    expect(mockWarning).toHaveBeenCalledTimes(1);
    const firstWarning = mockWarning.mock.calls[0][0];

    link.click();
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(mockWarning).toHaveBeenCalledTimes(2);
    expect(mockWarning.mock.calls[1][0]).not.toBe(firstWarning);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    dispose();
  }
});

it.each([url, "zenmind://open", otherProtocolUrl])("leaves %s to native browser handling in standalone", (href) => {
  inDesktop.mockReturnValue(false);
  hasHost.mockReturnValue(false);
  const browser = renderChat(true, href);
  try {
    const link = browser.container.querySelector("a[href]")!;
    expect(link.getAttribute("href")).toBe(href);
    const click = jest.fn((event: Event) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
    });
    browser.container.addEventListener("click", click);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  } finally {
    browser.dispose();
  }
});

it("reports a missing bridge in Desktop mode without producing an external anchor", async () => {
  hasHost.mockReturnValue(false);
  const { container, dispose } = renderChat();
  try {
    expect(container.querySelector("a[href]")).toBeNull();
    container.querySelector<HTMLButtonElement>('button[role="link"]')!.click();
    await Promise.resolve();
    expect(post).not.toHaveBeenCalled();
    expect(mockWarning).toHaveBeenCalledTimes(1);
  } finally {
    dispose();
  }
});

it("keeps external protocol links in document previews inert", () => {
  const documentPreview = renderChat(false);
  try {
    expect(documentPreview.container.querySelector('button[role="link"], a[href]')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  } finally {
    documentPreview.dispose();
  }
});

it("keeps HTTP links on the ordinary path even when their URL looks like a desktop action", () => {
  const href = "https://navigate?path=%2Fsettings";
  const { container, dispose } = renderChat(true, href);
  try {
    expect(container.querySelector("a[href]")?.getAttribute("href")).toBe(href);
    expect(container.querySelector('button[role="link"]')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  } finally {
    dispose();
  }
});

it.each(["JavaScript:alert%281%29", "data:text/html,%3Cb%3Etest%3C/b%3E", "file:///private/report.txt"])(
  "keeps %s out of both the browser handoff and the Desktop bridge",
  (href) => {
    for (const embedded of [false, true]) {
      hasHost.mockReturnValue(embedded);
      inDesktop.mockReturnValue(embedded);
      const { container, dispose } = renderChat(true, href);
      try {
        expect(container.querySelector('button[role="link"], a[href]')).toBeNull();
        expect(post).not.toHaveBeenCalled();
      } finally {
        dispose();
      }
    }
  },
);

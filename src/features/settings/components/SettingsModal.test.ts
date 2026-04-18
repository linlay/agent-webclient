import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { SettingsModal, formatWsStatusText } from "@/features/settings/components/SettingsModal";

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppState: jest.fn(),
    useAppDispatch: jest.fn(),
  };
});

jest.mock("@/shared/utils/routing", () => {
  const actual = jest.requireActual("@/shared/utils/routing");
  return {
    ...actual,
    isAppMode: jest.fn(() => false),
  };
});

const { useAppState, useAppDispatch } = jest.requireMock(
  "@/app/state/AppContext",
) as {
  useAppState: jest.Mock;
  useAppDispatch: jest.Mock;
};

const globalWithWindow = globalThis as typeof globalThis & {
  window?: { location?: { search?: string } };
};
const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

describe("formatWsStatusText", () => {
  it("shows the detailed websocket error when available", () => {
    expect(
      formatWsStatusText(
        "error",
        "WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
      ),
    ).toBe(
      "WebSocket 连接异常：WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
    );
  });

  it("falls back to generic status text when no error details exist", () => {
    expect(formatWsStatusText("connected")).toBe("WebSocket 已连接");
    expect(formatWsStatusText("connecting")).toBe("WebSocket 连接中...");
    expect(formatWsStatusText("disconnected")).toBe("WebSocket 未连接");
  });
});

describe("SettingsModal", () => {
  const originalWindow = globalWithWindow.window;
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    useAppDispatch.mockReturnValue(jest.fn());
    delete globalWithWindow.window;
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useAppState.mockReturnValue(createInitialState());
  });

  afterAll(() => {
    if (originalWindow) {
      globalWithWindow.window = originalWindow;
    } else {
      delete globalWithWindow.window;
    }

    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
    } else {
      delete globalWithStorage.localStorage;
    }
  });

  it("wraps conversation, theme, and transport controls in the preferences grid", () => {
    const html = renderToStaticMarkup(React.createElement(SettingsModal));

    expect(html).toContain("settings-preferences-grid");
    expect(html).toContain("对话模式");
    expect(html).toContain("界面主题");
    expect(html).toContain("传输模式");
    expect(html).toContain("SSE");
    expect(html).toContain("WebSocket");
  });

  it("keeps the remaining controls in the preferences grid for desktop app mode", () => {
    globalWithWindow.window = {
      location: {
        search: "?desktopApp=1",
      },
    };

    const html = renderToStaticMarkup(React.createElement(SettingsModal));

    expect(html).toContain("settings-preferences-grid");
    expect(html).toContain("对话模式");
    expect(html).toContain("传输模式");
    expect(html).not.toContain("界面主题");
  });

  it("shows sse-specific transport guidance when sse is selected", () => {
    const state = createInitialState();
    useAppState.mockReturnValue({
      ...state,
      transportMode: "sse",
    });

    const html = renderToStaticMarkup(React.createElement(SettingsModal));

    expect(html).toContain("当前使用 SSE 查询流，不启用 live 实时同步。");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { SettingsModal, formatWsStatusText } from "@/features/settings/components/SettingsModal";
import { I18nProvider } from "@/shared/i18n";

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
        "WebSocket handshake failed. Check that the access token is valid and that the backend has enabled /ws.",
      ),
    ).toBe(
      "WebSocket connection error: WebSocket handshake failed. Check that the access token is valid and that the backend has enabled /ws.",
    );
  });

  it("falls back to generic status text when no error details exist", () => {
    expect(formatWsStatusText("connected")).toBe("WebSocket connected");
    expect(formatWsStatusText("connecting")).toBe("WebSocket connecting...");
    expect(formatWsStatusText("disconnected")).toBe("WebSocket disconnected");
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

  function renderSettingsModal() {
    return renderToStaticMarkup(
      React.createElement(I18nProvider, {
        locale: "en-US",
        fallbackLocale: "en-US",
        children: React.createElement(SettingsModal),
      }),
    );
  }

  it("wraps conversation, theme, and transport controls in the preferences grid", () => {
    const html = renderSettingsModal();

    expect(html).toContain("settings-preferences-grid");
    expect(html).toContain("Conversation mode");
    expect(html).toContain("Theme");
    expect(html).toContain("Transport mode");
    expect(html).toContain("SSE");
    expect(html).toContain("WebSocket");
  });

  it("keeps the remaining controls in the preferences grid for desktop app mode", () => {
    globalWithWindow.window = {
      location: {
        search: "?desktopApp=1",
      },
    };

    const html = renderSettingsModal();

    expect(html).toContain("settings-preferences-grid");
    expect(html).toContain("Conversation mode");
    expect(html).toContain("Transport mode");
    expect(html).not.toContain("Theme");
  });

  it("shows sse-specific transport guidance when sse is selected", () => {
    const state = createInitialState();
    useAppState.mockReturnValue({
      ...state,
      transportMode: "sse",
    });

    const html = renderSettingsModal();

    expect(html).toContain(
      "SSE is currently used for query streaming. Live synchronization is disabled, while regular APIs continue to work over HTTP.",
    );
  });
});

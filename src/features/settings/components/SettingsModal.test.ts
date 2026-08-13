import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { I18nProvider } from "@/shared/i18n";

jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  const React = require("react");
  return {
    ...actual,
    Modal: ({ children, className, open, title }: any) =>
      open
        ? React.createElement(
            "section",
            { className },
            title ? React.createElement("h2", null, title) : null,
            children,
          )
        : null,
  };
});

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
const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};
const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

describe("SettingsModal", () => {
  const originalWindow = globalWithWindow.window;
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    useAppDispatch.mockReturnValue(jest.fn());
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
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

  it("wraps theme and language controls in the preferences grid", () => {
    const html = renderSettingsModal();

    expect(html).toContain("settings-preferences-grid");
    expect(html).toContain("Theme");
    expect(html).toContain("Language");
    expect(html).toContain("Chinese");
    expect(html).toContain("English");
  });

  it("keeps the remaining controls in the preferences grid for desktop app mode", () => {
    globalWithWindow.window = {
      location: {
        search: "",
      },
    };
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "true",
    };

    const html = renderSettingsModal();

    expect(html).toContain("settings-preferences-grid");
    expect(html).toContain("Language");
    expect(html).not.toContain("Theme");
  });

  it("renders the language control in Chinese", () => {
    const html = renderToStaticMarkup(
      React.createElement(I18nProvider, {
        locale: "zh-CN",
        fallbackLocale: "zh-CN",
        children: React.createElement(SettingsModal),
      }),
    );

    expect(html).toContain("默认语言");
    expect(html).toContain("中文");
    expect(html).toContain("English");
  });

});

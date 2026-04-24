import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  I18nProvider,
  resolveInitialLocale,
  useI18n,
} from "@/shared/i18n";

describe("resolveInitialLocale", () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    if (originalWindow) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }

    if (originalNavigator) {
      (globalThis as Record<string, unknown>).navigator = originalNavigator;
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
  });

  it("prioritizes query param, then localStorage, then navigator, then fallback", () => {
    (globalThis as Record<string, unknown>).window = {
      location: {
        search: "?lang=zh-CN",
      },
      localStorage: {
        getItem: () => "en-US",
      },
    };
    (globalThis as Record<string, unknown>).navigator = {
      language: "en-US",
    };

    expect(resolveInitialLocale("en-US")).toBe("zh-CN");
  });
});

describe("I18nProvider", () => {
  function Probe() {
    const { t } = useI18n();
    return (
      <div>
        <span>{t("topNav.status.idle")}</span>
        <span>{t("slash.command.switch.label")}</span>
      </div>
    );
  }

  it("renders translated messages with locale-specific defaults", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN" persistLocale={false}>
        <Probe />
      </I18nProvider>,
    );

    expect(html).toContain("待命");
    expect(html).toContain("切换Agent");
  });

  it("applies host term overrides inside translated templates", () => {
    const html = renderToStaticMarkup(
      <I18nProvider
        locale="en-US"
        persistLocale={false}
        terms={{ agentLabel: "worker" }}
      >
        <Probe />
      </I18nProvider>,
    );

    expect(html).toContain("Idle");
    expect(html).toContain("Switch worker");
  });
});

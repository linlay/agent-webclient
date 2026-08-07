import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RunTerminalNotice } from "@/features/timeline/components/RunTerminalNotice";
import { I18nProvider, type Locale } from "@/shared/i18n";

function renderNotice(
  terminalType: "run.cancel" | "run.complete" | "run.error",
  locale: Locale = "zh-CN",
): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale, persistLocale: false },
      React.createElement(RunTerminalNotice, { terminalType }),
    ),
  );
}

describe("RunTerminalNotice", () => {
  it("renders one neutral notice for run.cancel", () => {
    const html = renderNotice("run.cancel");

    expect(html).toContain('data-run-terminal="run.cancel"');
    expect(html).toContain("本次运行已中断");
    expect(html).toContain('data-material-icon="stop_circle"');
    expect(html.match(/timeline-run-cancel-notice/g)).toHaveLength(1);
    expect(html).not.toContain("accent-danger");
  });

  it("uses the English translation when requested", () => {
    expect(renderNotice("run.cancel", "en-US")).toContain(
      "This run was interrupted.",
    );
  });

  it("stays hidden for non-cancel terminal states", () => {
    for (const terminalType of ["run.complete", "run.error"] as const) {
      expect(renderNotice(terminalType)).toBe("");
    }
  });
});

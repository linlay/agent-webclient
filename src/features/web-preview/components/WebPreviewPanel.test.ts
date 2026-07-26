import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WEB_PREVIEW_IFRAME_SANDBOX,
  WebPreviewPanel,
} from "@/features/web-preview/components/WebPreviewPanel";
import { I18nProvider } from "@/shared/i18n";

describe("WebPreviewPanel", () => {
  it("renders a sandboxed iframe without top-navigation permission", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(WebPreviewPanel, {
          preview: {
            title: "百度",
            url: "https://www.baidu.com/",
          },
        }),
      ),
    );

    expect(html).toContain('src="https://www.baidu.com/"');
    expect(html).toContain(`sandbox="${WEB_PREVIEW_IFRAME_SANDBOX}"`);
    expect(WEB_PREVIEW_IFRAME_SANDBOX).not.toContain("allow-top-navigation");
    expect(html).not.toContain("web-preview-toolbar");
  });
});

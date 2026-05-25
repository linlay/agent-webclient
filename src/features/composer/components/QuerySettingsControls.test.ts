import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuerySettingsControls } from "@/features/composer/components/QuerySettingsControls";

jest.mock("@/app/state/AppContext", () => ({
  useAppState: jest.fn(() => ({})),
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: jest.fn(),
}));

jest.mock("@/features/transport/lib/apiClientProxy", () => ({
  getAgentEditorOptions: jest.fn(),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "composer.query.access.default": "默认权限",
        "composer.query.access.title": "设置本次运行权限",
        "composer.query.model.default": "默认模型",
        "composer.query.model.title": "选择模型和思考深度",
        "composer.query.reasoning.default": "默认思考",
      };
      return messages[key] || key;
    },
  }),
}));

const { resolveCurrentWorkerSummary } = jest.requireMock(
  "@/features/workers/lib/currentWorker",
) as {
  resolveCurrentWorkerSummary: jest.Mock;
};

describe("QuerySettingsControls", () => {
  beforeEach(() => {
    resolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      raw: { mode: "REACT" },
    });
  });

  it("shows the access selector for every agent", () => {
    const html = renderToStaticMarkup(
      React.createElement(QuerySettingsControls, {
        accessLevel: "default",
        modelOverride: {},
        onAccessLevelChange: jest.fn(),
        onModelOverrideChange: jest.fn(),
      }),
    );

    expect(html).toContain("默认权限");
  });

  it("shows the model selector only for CODER agents", () => {
    resolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      raw: { mode: "CODER" },
    });

    const coderHtml = renderToStaticMarkup(
      React.createElement(QuerySettingsControls, {
        accessLevel: "default",
        modelOverride: {},
        onAccessLevelChange: jest.fn(),
        onModelOverrideChange: jest.fn(),
      }),
    );
    expect(coderHtml).toContain("默认模型");

    resolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      raw: { mode: "REACT" },
    });
    const nonCoderHtml = renderToStaticMarkup(
      React.createElement(QuerySettingsControls, {
        accessLevel: "default",
        modelOverride: {},
        onAccessLevelChange: jest.fn(),
        onModelOverrideChange: jest.fn(),
      }),
    );
    expect(nonCoderHtml).not.toContain("默认模型");
  });
});

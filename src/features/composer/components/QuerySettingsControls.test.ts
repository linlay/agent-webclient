import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  loadCoderModelOptions,
  QuerySettingsControls,
} from "@/features/composer/components/QuerySettingsControls";

jest.mock("@/app/state/AppContext", () => ({
  useAppState: jest.fn(() => ({})),
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: jest.fn(),
}));

jest.mock("@/features/transport/lib/apiClientProxy", () => ({
  getModelOptions: jest.fn(),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "composer.query.access.default": "默认权限",
        "composer.query.access.title": "设置本次运行权限",
        "composer.query.model.default": "默认模型",
        "composer.query.model.title": "选择模型和思考深度",
        "composer.query.reasoning.NONE": "关闭",
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
const { getModelOptions } = jest.requireMock(
  "@/features/transport/lib/apiClientProxy",
) as {
  getModelOptions: jest.Mock;
};

describe("QuerySettingsControls", () => {
  beforeEach(() => {
    getModelOptions.mockReset();
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

  it("loads global CODER model options", async () => {
    getModelOptions.mockResolvedValue({
      data: {
        models: [{ key: "coder-model", modelId: "qwen3-coder" }],
        reasoningEfforts: [{ key: "NONE", label: "NONE" }],
      },
    });

    await expect(loadCoderModelOptions()).resolves.toEqual({
      models: [{ key: "coder-model", modelId: "qwen3-coder" }],
      reasoningEfforts: [{ key: "NONE", label: "NONE" }],
    });
    expect(getModelOptions).toHaveBeenCalledWith();
  });

  it("renders selected NONE reasoning label", () => {
    resolveCurrentWorkerSummary.mockReturnValue({
      key: "coder-agent",
      sourceId: "coder-agent",
      type: "agent",
      raw: { mode: "CODER" },
      row: { agentType: "coder" },
    });

    const html = renderToStaticMarkup(
      React.createElement(QuerySettingsControls, {
        accessLevel: "default",
        modelOverride: { reasoningEffort: "NONE" },
        onAccessLevelChange: jest.fn(),
        onModelOverrideChange: jest.fn(),
      }),
    );

    expect(html).toContain("默认模型 / 关闭");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildModelMenuItems,
  loadCoderModelOptions,
  normalizeCoderModelOptionsResponse,
  QuerySettingsControls,
  shouldClearModelOverride,
  shouldRetryModelOptionsOnOpen,
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
        "composer.query.model.empty": "暂无可选模型",
        "composer.query.model.group": "模型",
        "composer.query.model.loadFailed": "模型加载失败，重新打开可重试",
        "composer.query.model.loading": "正在加载模型...",
        "composer.query.model.title": "选择模型和思考深度",
        "composer.query.reasoning.group": "思考深度",
        "composer.query.reasoning.HIGH": "高",
        "composer.query.reasoning.NONE": "关闭",
        "composer.query.reasoning.default": "默认思考",
        "composer.query.reasoning.empty": "暂无可选思考深度",
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

  it("normalizes standard, nested, and bare model option payloads", () => {
    const payload = {
      models: [
        { key: "coder-model", modelId: "qwen3-coder", isReasoner: true, isVision: false },
        { key: "", modelId: "ignored", isReasoner: true, isVision: false },
      ],
      reasoningEfforts: [
        { key: "NONE", label: "NONE" },
        { key: "", label: "ignored" },
      ],
    };

    expect(normalizeCoderModelOptionsResponse({ data: payload })).toMatchObject({
      models: [{ key: "coder-model" }],
      reasoningEfforts: [{ key: "NONE" }],
      recognized: true,
    });
    expect(normalizeCoderModelOptionsResponse({ data: { data: payload } })).toMatchObject({
      models: [{ key: "coder-model" }],
      reasoningEfforts: [{ key: "NONE" }],
      recognized: true,
    });
    expect(normalizeCoderModelOptionsResponse(payload)).toMatchObject({
      models: [{ key: "coder-model" }],
      reasoningEfforts: [{ key: "NONE" }],
      recognized: true,
    });
  });

  it("loads nested model options returned by a wrapped response", async () => {
    getModelOptions.mockResolvedValue({
      data: {
        data: {
          models: [{ key: "nested-model", modelId: "qwen3-nested" }],
          reasoningEfforts: [{ key: "HIGH", label: "HIGH" }],
        },
      },
    });

    await expect(loadCoderModelOptions()).resolves.toMatchObject({
      models: [{ key: "nested-model", modelId: "qwen3-nested" }],
      reasoningEfforts: [{ key: "HIGH", label: "HIGH" }],
    });
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

  it("builds menu items from returned model options", () => {
    const items = buildModelMenuItems({
      models: [
        {
          key: "babelark-qwen3_5-plus",
          provider: "babelark",
          modelId: "qwen3.5-plus",
          protocol: "OPENAI",
          isReasoner: true,
          isVision: true,
        },
      ],
      reasoningEfforts: [{ key: "HIGH", label: "HIGH" }],
      modelOverride: {},
      t: (key) => {
        const messages: Record<string, string> = {
          "composer.query.model.default": "默认模型",
          "composer.query.model.empty": "暂无可选模型",
          "composer.query.model.group": "模型",
          "composer.query.model.loadFailed": "模型加载失败，重新打开可重试",
          "composer.query.model.loading": "正在加载模型...",
          "composer.query.reasoning.default": "默认思考",
          "composer.query.reasoning.group": "思考深度",
          "composer.query.reasoning.HIGH": "高",
          "composer.query.reasoning.empty": "暂无可选思考深度",
        };
        return messages[key] || key;
      },
    }) as Array<{ children?: Array<{ key: string; label: React.ReactNode }> }>;

    const modelChildren = items[0].children || [];
    const reasoningChildren = items[1].children || [];
    const modelHtml = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        modelChildren.map((item) =>
          React.createElement(React.Fragment, { key: item.key }, item.label),
        ),
      ),
    );
    const reasoningHtml = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        reasoningChildren.map((item) =>
          React.createElement(React.Fragment, { key: item.key }, item.label),
        ),
      ),
    );

    expect(modelChildren.map((item) => item.key)).toEqual([
      "model:",
      "model:babelark-qwen3_5-plus",
    ]);
    expect(reasoningChildren.map((item) => item.key)).toEqual([
      "reasoning:",
      "reasoning:HIGH",
    ]);
    expect(modelHtml).toContain("默认模型");
    expect(modelHtml).toContain("babelark-qwen3_5-plus · qwen3.5-plus");
    expect(reasoningHtml).toContain("默认思考");
    expect(reasoningHtml).toContain("高");
  });

  it("retries model loading when the menu opens after an empty or failed load", () => {
    expect(
      shouldRetryModelOptionsOnOpen({
        open: true,
        isCoderAgent: true,
        agentKey: "agent:coder",
        modelsLoading: false,
        status: "failed",
        models: [],
        reasoningEfforts: [],
      }),
    ).toBe(true);

    expect(
      shouldRetryModelOptionsOnOpen({
        open: true,
        isCoderAgent: true,
        agentKey: "agent:coder",
        modelsLoading: false,
        status: "loaded",
        models: [
          {
            key: "coder-model",
            provider: "test",
            modelId: "qwen3-coder",
            protocol: "OPENAI",
            isReasoner: true,
            isVision: false,
          },
        ],
        reasoningEfforts: [],
      }),
    ).toBe(false);
  });

  it("does not retry successful empty model responses on every menu open", () => {
    expect(
      shouldRetryModelOptionsOnOpen({
        open: true,
        isCoderAgent: true,
        agentKey: "agent:coder",
        modelsLoading: false,
        status: "empty",
        models: [],
        reasoningEfforts: [],
      }),
    ).toBe(false);
  });

  it("shows empty and failed menu states instead of silently showing defaults only", () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        "composer.query.model.default": "默认模型",
        "composer.query.model.empty": "暂无可选模型",
        "composer.query.model.group": "模型",
        "composer.query.model.loadFailed": "模型加载失败，重新打开可重试",
        "composer.query.reasoning.default": "默认思考",
        "composer.query.reasoning.empty": "暂无可选思考深度",
        "composer.query.reasoning.group": "思考深度",
      };
      return messages[key] || key;
    };
    const emptyItems = buildModelMenuItems({
      models: [],
      reasoningEfforts: [],
      modelOverride: {},
      status: "empty",
      t,
    }) as Array<{ children?: Array<{ label: React.ReactNode }> }>;
    const failedItems = buildModelMenuItems({
      models: [],
      reasoningEfforts: [],
      modelOverride: {},
      status: "failed",
      t,
    }) as Array<{ children?: Array<{ label: React.ReactNode }> }>;

    const emptyHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, emptyItems.flatMap((item) =>
        (item.children || []).map((child, index) =>
          React.createElement(React.Fragment, { key: index }, child.label),
        ),
      )),
    );
    const failedHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, failedItems.flatMap((item) =>
        (item.children || []).map((child, index) =>
          React.createElement(React.Fragment, { key: index }, child.label),
        ),
      )),
    );

    expect(emptyHtml).toContain("暂无可选模型");
    expect(emptyHtml).toContain("暂无可选思考深度");
    expect(failedHtml).toContain("模型加载失败，重新打开可重试");
  });

  it("clears model overrides outside CODER agents", () => {
    expect(
      shouldClearModelOverride(false, {
        key: "coder-model",
        reasoningEffort: "HIGH",
      }),
    ).toBe(true);
    expect(shouldClearModelOverride(true, { key: "coder-model" })).toBe(false);
    expect(shouldClearModelOverride(false, {})).toBe(false);
  });
});

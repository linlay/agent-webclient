import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Agent } from "@/app/state/types";
import {
  agentSummaryFromModelConfig,
  buildModelMenuItems,
  buildPersistedModelConfigOverride,
  clearCoderModelOptionsCacheForTest,
  getCachedCoderModelOptions,
  getModelIdentityMismatchWarning,
  loadCoderModelOptions,
  normalizeCoderModelOptionsResponse,
  QuerySettingsControls,
  resolveCoderAgentDefaultModelOverride,
  shouldClearModelOverride,
  shouldRetryModelOptionsOnOpen,
  toAgentConfigKey,
} from "@/features/composer/components/QuerySettingsControls";

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: jest.fn(() => ({ state: { agents: [] }, dispatch: jest.fn() })),
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: jest.fn(),
}));

jest.mock("@/features/transport/lib/apiClientProxy", () => ({
  getModelOptions: jest.fn(),
  updateAgentModelConfig: jest.fn(),
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
        "composer.query.model.saving": "保存中...",
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
const { getModelOptions, updateAgentModelConfig } = jest.requireMock(
  "@/features/transport/lib/apiClientProxy",
) as {
  getModelOptions: jest.Mock;
  updateAgentModelConfig: jest.Mock;
};

type TestMenuItem = {
  key: string;
  children?: TestMenuItem[];
  label?: React.ReactNode;
};

function getModelMenuChildren(items: TestMenuItem[]): TestMenuItem[] {
  const modelSubmenu = items.find((item) => item.key === "model-submenu");
  return modelSubmenu?.children?.[0]?.children || [];
}

describe("QuerySettingsControls", () => {
  beforeEach(() => {
    clearCoderModelOptionsCacheForTest();
    getModelOptions.mockReset();
    updateAgentModelConfig.mockReset();
    resolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      raw: { mode: "REACT" },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it("builds complete persisted model config payloads from partial menu changes", () => {
    expect(
      buildPersistedModelConfigOverride({
        current: { key: "old-model", reasoningEffort: "LOW" },
        patch: { key: "new-model" },
        defaults: { defaultModelKey: "default-model", defaultReasoningEffort: "HIGH" },
      }),
    ).toEqual({ key: "new-model", reasoningEffort: "LOW" });

    expect(
      buildPersistedModelConfigOverride({
        current: {},
        patch: { reasoningEffort: "NONE" },
        defaults: { defaultModelKey: "default-model", defaultReasoningEffort: "HIGH" },
      }),
    ).toEqual({ key: "default-model", reasoningEffort: "NONE" });
  });

  it("normalizes worker agent keys before model config persistence", () => {
    expect(toAgentConfigKey("agent:coder")).toBe("coder");
    expect(toAgentConfigKey("coder")).toBe("coder");
    expect(toAgentConfigKey(" agent:coder ")).toBe("coder");
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
    expect(coderHtml).toContain("正在加载模型");

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
    expect(nonCoderHtml).not.toContain("正在加载模型");
  });

  it("can hide the model selector while keeping access controls", () => {
    resolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      raw: { mode: "CODER" },
    });

    const html = renderToStaticMarkup(
      React.createElement(QuerySettingsControls, {
        accessLevel: "default",
        modelOverride: {},
        onAccessLevelChange: jest.fn(),
        onModelOverrideChange: jest.fn(),
        showModelSelector: false,
      }),
    );

    expect(html).toContain("默认权限");
    expect(html).not.toContain("正在加载模型");
  });

  it("loads global CODER model options", async () => {
    getModelOptions.mockResolvedValue({
      data: {
        models: [{ key: "coder-model", modelId: "qwen3-coder" }],
        reasoningEfforts: [{ key: "NONE", label: "NONE" }],
        defaultModelKey: "coder-model",
        defaultReasoningEffort: "NONE",
      },
    });

    await expect(loadCoderModelOptions()).resolves.toMatchObject({
      models: [{ key: "coder-model", modelId: "qwen3-coder" }],
      reasoningEfforts: [{ key: "NONE", label: "NONE" }],
      defaultModelKey: "coder-model",
      defaultReasoningEffort: "NONE",
    });
    expect(getModelOptions).toHaveBeenCalledWith();
  });

  it("returns cached model options after the first successful load", async () => {
    getModelOptions.mockResolvedValue({
      data: {
        models: [{ key: "cached-model", modelId: "qwen3-cached" }],
        reasoningEfforts: [{ key: "MEDIUM", label: "MEDIUM" }],
      },
    });

    await expect(loadCoderModelOptions()).resolves.toMatchObject({
      models: [{ key: "cached-model" }],
      reasoningEfforts: [{ key: "MEDIUM" }],
    });
    await expect(loadCoderModelOptions()).resolves.toMatchObject({
      models: [{ key: "cached-model" }],
      reasoningEfforts: [{ key: "MEDIUM" }],
    });

    expect(getModelOptions).toHaveBeenCalledTimes(1);
    expect(getCachedCoderModelOptions()).toMatchObject({
      models: [{ key: "cached-model" }],
      reasoningEfforts: [{ key: "MEDIUM" }],
    });
  });

  it("coalesces concurrent model option loads into one request", async () => {
    getModelOptions.mockResolvedValue({
      data: {
        models: [{ key: "shared-model", modelId: "qwen3-shared" }],
        reasoningEfforts: [{ key: "LOW", label: "LOW" }],
      },
    });

    const first = loadCoderModelOptions();
    const second = loadCoderModelOptions();

    expect(getModelOptions).toHaveBeenCalledTimes(1);
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      {
        models: [{ key: "shared-model", modelId: "qwen3-shared" }],
        reasoningEfforts: [{ key: "LOW", label: "LOW" }],
      },
      {
        models: [{ key: "shared-model", modelId: "qwen3-shared" }],
        reasoningEfforts: [{ key: "LOW", label: "LOW" }],
      },
    ]);
  });

  it("does not cache failed model option loads", async () => {
    getModelOptions
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        data: {
          models: [{ key: "retry-model", modelId: "qwen3-retry" }],
          reasoningEfforts: [{ key: "HIGH", label: "HIGH" }],
        },
      });

    await expect(loadCoderModelOptions()).rejects.toThrow("network timeout");
    expect(getCachedCoderModelOptions()).toBeNull();

    await expect(loadCoderModelOptions()).resolves.toMatchObject({
      models: [{ key: "retry-model" }],
      reasoningEfforts: [{ key: "HIGH" }],
    });
    expect(getModelOptions).toHaveBeenCalledTimes(2);
  });

  it("normalizes standard, nested, and bare model option payloads", () => {
    const payload = {
      models: [
        { key: "coder-model", name: "Qwen Coder", modelId: "qwen3-coder", isReasoner: true, isVision: false },
        { key: "", modelId: "ignored", isReasoner: true, isVision: false },
      ],
      reasoningEfforts: [
        { key: "NONE", label: "NONE" },
        { key: "", label: "ignored" },
      ],
      defaultModelKey: "default-coder-model",
      defaultReasoningEffort: "HIGH",
    };

    expect(normalizeCoderModelOptionsResponse({ data: payload })).toMatchObject({
      models: [{ key: "coder-model", name: "Qwen Coder" }],
      reasoningEfforts: [{ key: "NONE" }],
      defaultModelKey: "default-coder-model",
      defaultReasoningEffort: "HIGH",
      recognized: true,
    });
    expect(normalizeCoderModelOptionsResponse({ data: { data: payload } })).toMatchObject({
      models: [{ key: "coder-model", name: "Qwen Coder" }],
      reasoningEfforts: [{ key: "NONE" }],
      defaultModelKey: "default-coder-model",
      defaultReasoningEffort: "HIGH",
      recognized: true,
    });
    expect(normalizeCoderModelOptionsResponse(payload)).toMatchObject({
      models: [{ key: "coder-model", name: "Qwen Coder" }],
      reasoningEfforts: [{ key: "NONE" }],
      defaultModelKey: "default-coder-model",
      defaultReasoningEffort: "HIGH",
      recognized: true,
    });
  });

  it("warns when model display identity conflicts with technical identifiers", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const mismatchModel = {
      key: "babelark-qwen3_5-397b-a17b",
      name: "DeepSeek V4 Pro",
      provider: "babelark",
      modelId: "qwen3.5-397b-a17b",
      isReasoner: true,
      isVision: true,
    };

    expect(getModelIdentityMismatchWarning(mismatchModel)).toContain(
      "display name \"DeepSeek V4 Pro\" is deepseek",
    );
    normalizeCoderModelOptionsResponse({
      data: {
        models: [mismatchModel],
        reasoningEfforts: [],
      },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Model option identity mismatch"),
      mismatchModel,
    );
  });

  it("does not warn when model display identity matches technical identifiers", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const matchedModel = {
      key: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      provider: "deepseek",
      modelId: "deepseek-v4-pro",
      isReasoner: true,
      isVision: true,
    };

    expect(getModelIdentityMismatchWarning(matchedModel)).toBe("");
    normalizeCoderModelOptionsResponse({
      data: {
        models: [matchedModel],
        reasoningEfforts: [],
      },
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it("uses agent model defaults before API defaults", () => {
    expect(
      resolveCoderAgentDefaultModelOverride(
        {
          raw: {
            mode: "CODER",
            meta: {
              modelKey: "agent-model",
              reasoningEffort: "LOW",
            },
          },
        },
        {
          defaultModelKey: "api-model",
          defaultReasoningEffort: "HIGH",
        },
      ),
    ).toEqual({
      key: "agent-model",
      reasoningEffort: "LOW",
    });
  });

  it("falls back to API model defaults when the agent has none", () => {
    expect(
      resolveCoderAgentDefaultModelOverride(
        {
          raw: {
            mode: "CODER",
          },
        },
        {
          defaultModelKey: "api-model",
          defaultReasoningEffort: "MEDIUM",
        },
      ),
    ).toEqual({
      key: "api-model",
      reasoningEffort: "MEDIUM",
    });
  });

  it("loads nested model options returned by a wrapped response", async () => {
    getModelOptions.mockResolvedValue({
      data: {
        data: {
          models: [{ key: "nested-model", name: "Nested Model", modelId: "qwen3-nested" }],
          reasoningEfforts: [{ key: "HIGH", label: "HIGH" }],
        },
      },
    });

    await expect(loadCoderModelOptions()).resolves.toMatchObject({
      models: [{ key: "nested-model", name: "Nested Model", modelId: "qwen3-nested" }],
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
        modelOverride: { key: "coder-model", reasoningEffort: "NONE" },
        onAccessLevelChange: jest.fn(),
        onModelOverrideChange: jest.fn(),
      }),
    );

    expect(html).toContain("coder-model");
    expect(html).toContain("关闭");
  });

  it("does not display an unsynced default model as the selected model", () => {
    const items = buildModelMenuItems({
      models: [
        {
          key: "deepseek-v4-pro",
          name: "DeepSeek V4 Pro",
          provider: "deepseek",
          modelId: "deepseek-v4-pro",
          isReasoner: true,
          isVision: true,
        },
      ],
      reasoningEfforts: [{ key: "MEDIUM", label: "MEDIUM" }],
      modelOverride: {},
      selectedModelKey: "",
      selectedModelLabel: "正在加载模型...",
      t: (key) => {
        const messages: Record<string, string> = {
          "composer.query.model.group": "模型",
          "composer.query.reasoning.group": "思考深度",
        };
        return messages[key] || key;
      },
    }) as Array<{ key: string; label?: React.ReactNode }>;
    const modelSubmenuHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, items[1].label),
    );

    expect(modelSubmenuHtml).toContain("正在加载模型");
    expect(modelSubmenuHtml).not.toContain("DeepSeek V4 Pro");
  });

  it("puts reasoning options at the top level and model options in a submenu", () => {
    const items = buildModelMenuItems({
      models: [
        {
          key: "babelark-qwen3_5-plus",
          name: "Qwen Coder Plus",
          provider: "babelark",
          modelId: "qwen3.5-plus",
          protocol: "OPENAI",
          isReasoner: true,
          isVision: true,
        },
      ],
      reasoningEfforts: [{ key: "HIGH", label: "HIGH" }],
      modelOverride: {
        key: "babelark-qwen3_5-plus",
        reasoningEffort: "HIGH",
      },
      selectedModelKey: "babelark-qwen3_5-plus",
      selectedModelLabel: "Qwen Coder Plus",
      selectedReasoningEffort: "HIGH",
      t: (key) => {
        const messages: Record<string, string> = {
          "composer.query.model.empty": "暂无可选模型",
          "composer.query.model.group": "模型",
          "composer.query.model.loadFailed": "模型加载失败，重新打开可重试",
          "composer.query.model.loading": "正在加载模型...",
          "composer.query.reasoning.group": "思考深度",
          "composer.query.reasoning.HIGH": "高",
          "composer.query.reasoning.empty": "暂无可选思考深度",
        };
        return messages[key] || key;
      },
    }) as TestMenuItem[];

    const reasoningChildren = items[0].children || [];
    const modelSubmenu = items[1];
    const modelChildren = getModelMenuChildren(items);
    const modelHtml = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        modelChildren.map((item) =>
          React.createElement(React.Fragment, { key: item.key }, item.label),
        ),
      ),
    );
    const modelSubmenuHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, modelSubmenu.label),
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

    expect(items.map((item) => item.key)).toEqual(["reasoning", "model-submenu"]);
    expect(reasoningChildren.map((item) => item.key)).toEqual([
      "reasoning:HIGH",
    ]);
    expect(modelChildren.map((item) => item.key)).toEqual([
      "model:babelark-qwen3_5-plus",
    ]);
    expect(modelSubmenuHtml).toContain("Qwen Coder Plus");
    expect(modelHtml).not.toContain("默认模型");
    expect(modelHtml).toContain("Qwen Coder Plus");
    expect(modelHtml).not.toContain("babelark-qwen3_5-plus");
    expect(modelHtml).not.toContain("qwen3.5-plus");
    expect(reasoningHtml).not.toContain("默认思考");
    expect(reasoningHtml).toContain("高");
  });

  it("falls back to key and modelId when a model name is missing", () => {
    const items = buildModelMenuItems({
      models: [
        {
          key: "legacy-coder",
          modelId: "qwen3-legacy",
          isReasoner: true,
          isVision: false,
        },
      ],
      reasoningEfforts: [],
      modelOverride: { key: "legacy-coder" },
      selectedModelKey: "legacy-coder",
      selectedModelLabel: "legacy-coder · qwen3-legacy",
      t: (key) => {
        const messages: Record<string, string> = {
          "composer.query.model.group": "模型",
          "composer.query.reasoning.group": "思考深度",
        };
        return messages[key] || key;
      },
    }) as TestMenuItem[];
    const modelChildren = getModelMenuChildren(items);
    const modelHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, modelChildren[0]?.label),
    );

    expect(modelHtml).toContain("legacy-coder · qwen3-legacy");
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

  it("shows loading, empty, and failed states inside the model submenu", () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        "composer.query.model.empty": "暂无可选模型",
        "composer.query.model.group": "模型",
        "composer.query.model.loadFailed": "模型加载失败，重新打开可重试",
        "composer.query.model.loading": "正在加载模型...",
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
    }) as TestMenuItem[];
    const loadingItems = buildModelMenuItems({
      models: [],
      reasoningEfforts: [],
      modelOverride: {},
      modelsLoading: true,
      t,
    }) as TestMenuItem[];
    const failedItems = buildModelMenuItems({
      models: [],
      reasoningEfforts: [],
      modelOverride: {},
      status: "failed",
      t,
    }) as TestMenuItem[];
    const emptyModelChildren = getModelMenuChildren(emptyItems);
    const loadingModelChildren = getModelMenuChildren(loadingItems);
    const failedModelChildren = getModelMenuChildren(failedItems);

    const emptyHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, emptyModelChildren.map((child, index) =>
          React.createElement(React.Fragment, { key: index }, child.label),
      )),
    );
    const loadingHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, loadingModelChildren.map((child, index) =>
          React.createElement(React.Fragment, { key: index }, child.label),
      )),
    );
    const failedHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, failedModelChildren.map((child, index) =>
          React.createElement(React.Fragment, { key: index }, child.label),
      )),
    );

    expect(emptyModelChildren.map((item) => item.key)).toEqual(["model-status:empty"]);
    expect(loadingModelChildren.map((item) => item.key)).toEqual(["model-status:loading"]);
    expect(failedModelChildren.map((item) => item.key)).toEqual(["model-status:failed"]);
    expect(loadingHtml).toContain("正在加载模型...");
    expect(emptyHtml).toContain("暂无可选模型");
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

  it("merges compact model config responses into existing agent summaries", () => {
    const existing: Agent = {
      key: "coder-agent",
      name: "Coder Agent",
      mode: "CODER",
      source: { kind: "directory", path: "/tmp/agent.yml" },
      controls: [{ key: "planningMode", type: "switch", icon: null, label: "Planning" }],
      definition: {
        key: "coder-agent",
        name: "Coder Agent",
        mode: "CODER",
        runtimeConfig: { workspaceRoot: "/workspace" },
        modelConfig: { modelKey: "old-model" },
      },
      meta: { workspace: { root: "/workspace" }, modelKey: "old-model" },
    };

    const merged = agentSummaryFromModelConfig(
      existing,
      {
        key: "coder-agent",
        modelConfig: {
          modelKey: "new-model",
          reasoning: { enabled: true, effort: "HIGH" },
        },
      },
      { key: "new-model", reasoningEffort: "HIGH" },
    );

    expect(merged.name).toBe("Coder Agent");
    expect(merged.mode).toBe("CODER");
    expect(merged.source).toEqual(existing.source);
    expect(merged.controls).toEqual(existing.controls);
    expect(merged.modelKey).toBe("new-model");
    expect(merged.defaultModelKey).toBe("new-model");
    expect(merged.defaultReasoningEffort).toBe("HIGH");
    expect(merged.definition).toEqual({
      key: "coder-agent",
      name: "Coder Agent",
      mode: "CODER",
      runtimeConfig: { workspaceRoot: "/workspace" },
      modelConfig: {
        modelKey: "new-model",
        reasoning: { enabled: true, effort: "HIGH" },
      },
    });
    expect(merged.meta).toEqual({
      workspace: { root: "/workspace" },
      modelKey: "new-model",
      reasoningEffort: "HIGH",
    });
  });
});

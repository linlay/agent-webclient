import {
  getModelProviderLabel,
  resolveModelIconFamily,
  resolveModelPresentation,
} from "@/shared/icons/model";

describe("model icon presentation", () => {
  it.each([
    ["Gemini 3.1 Flash Image Preview", "gemini-3.1-flash-image-preview", "gemini"],
    ["Kimi K2.7 Code", "kimi-k2.7-code", "kimi"],
    ["Qwen3.7 Max", "qwen3.7-max", "qwen"],
    ["GLM 5.2", "glm-5.2", "glm"],
    ["DS V4 Flash", "deepseek-v4-flash", "deepseek"],
    ["ChatGPT", "chatgpt", "chatgpt"],
    ["GPT-5.5", "gpt-5.5", "chatgpt"],
    ["Grok 4.5", "grok-4.5", "grok"],
    ["MiMo V2.5 Pro", "mimo-v2.5-pro", "mimo"],
    ["Max M3 Long Context", "minimax-m3", "minimax"],
    ["Claude Sonnet 4.5", "claude-sonnet-4.5", "claude"],
    ["Opus 4.7", "opus-4.7", "claude"],
    ["Step 3.7 Flash", "step-3.7-flash", "step"],
    ["OUR BGE M3 Local", "bge-m3-local", "bge"],
    ["BabelArk Text Embedding v4", "text-embedding-v4", "default"],
  ] as const)("resolves the %s model icon to %s", (name, modelId, family) => {
    expect(resolveModelIconFamily({ key: modelId, name, modelId, icon: name })).toBe(family);
  });

  it("uses icon before conflicting model identifiers", () => {
    expect(
      resolveModelIconFamily({
        key: "gpt-5.5",
        name: "GPT-5.5",
        modelId: "gpt-5.5",
        icon: "GLM 5.2",
      }),
    ).toBe("glm");
  });

  it("falls back to model identifiers when icon is missing or unknown", () => {
    expect(
      resolveModelIconFamily({
        key: "gpt-5.5",
        name: "GPT-5.5",
        modelId: "gpt-5.5",
      }),
    ).toBe("chatgpt");

    expect(
      resolveModelIconFamily({
        key: "kimi-k2.7-code",
        name: "Kimi K2.7 Code",
        modelId: "kimi-k2.7-code",
        icon: "Custom Registry Name",
      }),
    ).toBe("kimi");
  });

  it("keeps ACP model options renderable through the icon field", () => {
    expect(
      resolveModelIconFamily({
        key: "acp-proxy-model",
        name: "ACP Proxy Model",
        modelId: "unrecognized-model",
        icon: "MiniMax M2.5",
      }),
    ).toBe("minimax");
  });

  it("uses the model gateway as the provider label", () => {
    expect(
      getModelProviderLabel({
        key: "bailian-kimi-k2_7-code",
        name: "Kimi K2.7 Code",
        modelId: "kimi-k2.7-code",
        provider: "bailian",
      }),
    ).toBe("阿里云百炼");

    expect(
      getModelProviderLabel({
        key: "th-deepseek-v4-pro",
        name: "DS V4 Pro TH",
        modelId: "deepseek-v4-pro",
        provider: "th-deepseek",
      }),
    ).toBe("Transit Hub");
  });

  it("falls back to the native model provider when the gateway is not supplied", () => {
    expect(
      resolveModelPresentation({
        key: "gpt-5_5",
        name: "GPT-5.5",
        modelId: "gpt-5.5",
      }),
    ).toMatchObject({
      family: "chatgpt",
      provider: "OpenAI",
      icon: "svg-mock.svg",
      isMonochrome: true,
    });
  });

  it("keeps an unrecognized gateway name visible and uses the fallback icon", () => {
    expect(
      resolveModelPresentation({
        key: "private-custom-model",
        name: "Private Custom Model",
        modelId: "private-custom-model",
        icon: "Private Registry Model",
        provider: "private-router",
      }),
    ).toMatchObject({
      family: "default",
      provider: "private-router",
      icon: "svg-mock.svg",
      isMonochrome: true,
    });
  });
});

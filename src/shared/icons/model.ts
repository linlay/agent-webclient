import type { CoderModelOption } from "@/shared/data";

import bgeIcon from "./model-icons/bge.svg";
import chatgptIcon from "./model-icons/chatgpt.svg";
import claudeIcon from "./model-icons/claude.svg";
import deepseekIcon from "./model-icons/deepseek.svg";
import defaultIcon from "./model-icons/default.svg";
import geminiIcon from "./model-icons/gemini.svg";
import glmIcon from "./model-icons/glm.svg";
import grokIcon from "./model-icons/grok.svg";
import kimiIcon from "./model-icons/kimi.svg";
import minimaxIcon from "./model-icons/minimax.svg";
import mimoIcon from "./model-icons/mimo.svg";
import qwenIcon from "./model-icons/qwen.svg";
import stepIcon from "./model-icons/step.svg";

// Model-family SVGs are vendored from @lobehub/icons-static-svg v1.93.0 (MIT).
export type ModelIconFamily =
  | "bge"
  | "chatgpt"
  | "claude"
  | "deepseek"
  | "default"
  | "gemini"
  | "glm"
  | "grok"
  | "kimi"
  | "minimax"
  | "mimo"
  | "qwen"
  | "step";

export interface ModelPresentation {
  family: ModelIconFamily;
  icon: string;
  isMonochrome: boolean;
  provider: string;
}

type ModelIdentity = Pick<
  CoderModelOption,
  "icon" | "key" | "modelId" | "name" | "provider"
>;

const iconByFamily: Record<ModelIconFamily, string> = {
  bge: bgeIcon,
  chatgpt: chatgptIcon,
  claude: claudeIcon,
  deepseek: deepseekIcon,
  default: defaultIcon,
  gemini: geminiIcon,
  glm: glmIcon,
  grok: grokIcon,
  kimi: kimiIcon,
  minimax: minimaxIcon,
  mimo: mimoIcon,
  qwen: qwenIcon,
  step: stepIcon,
};

const channelLabelByProvider: Record<string, string> = {
  babelark: "BabelArk",
  "babelark-for-kb": "BabelArk",
  bailian: "阿里云百炼",
  deepseek: "DeepSeek",
  grok: "xAI",
  mimo: "小米 MiMo",
  minimax: "MiniMax",
  our: "OUR",
};

const nativeProviderByFamily: Partial<Record<ModelIconFamily, string>> = {
  bge: "BAAI",
  chatgpt: "OpenAI",
  claude: "Anthropic",
  deepseek: "DeepSeek",
  gemini: "Google",
  glm: "智谱 AI",
  grok: "xAI",
  kimi: "Moonshot AI",
  minimax: "MiniMax",
  mimo: "小米 MiMo",
  qwen: "阿里云",
  step: "阶跃星辰",
};

const monochromeFamilies = new Set<ModelIconFamily>([
  "bge",
  "chatgpt",
  "claude",
  "default",
  "kimi",
  "grok",
  "mimo",
  "step",
]);

function normalizeIdentityText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function resolveModelIconFamily(model: ModelIdentity): ModelIconFamily {
  const icon = normalizeIdentityText(model.icon);
  return Object.prototype.hasOwnProperty.call(iconByFamily, icon)
    ? icon as ModelIconFamily
    : "default";
}

export function getModelProviderLabel(
  model: ModelIdentity,
  family = resolveModelIconFamily(model),
): string {
  const provider = normalizeIdentityText(model.provider);
  if (provider.startsWith("th-")) return "Transit Hub";
  if (provider && channelLabelByProvider[provider]) {
    return channelLabelByProvider[provider];
  }
  if (provider) return String(model.provider).trim();
  return nativeProviderByFamily[family] || "Custom";
}

export function resolveModelPresentation(model: ModelIdentity): ModelPresentation {
  const family = resolveModelIconFamily(model);
  return {
    family,
    icon: iconByFamily[family],
    isMonochrome: monochromeFamilies.has(family),
    provider: getModelProviderLabel(model, family),
  };
}

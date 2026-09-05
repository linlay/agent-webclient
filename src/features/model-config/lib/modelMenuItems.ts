import React from "react";
import type { MenuProps } from "antd";
import type {
  CoderModelOption,
  QueryModelOverride,
  QueryReasoningEffort,
  QueryServiceTier,
  ReasoningEffortOption,
  ServiceTierOption,
} from "@/shared/data";
import { resolveModelPresentation } from "@/shared/icons/model";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

export type ModelOptionsStatus = "idle" | "loaded" | "empty" | "failed";

const MENU_ITEM_CLASS =
  "query-settings-menu-item tw:inline-flex tw:items-center tw:justify-between tw:gap-1.5 tw:text-[13px] tw:[&_.material-icon]:text-sm";
const MODEL_MENU_ITEM_CLASS = "query-model-menu-item";

function toText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeServiceTier(value: unknown): QueryServiceTier | undefined {
  const text = toText(value).toUpperCase();
  if (text === "STANDARD" || text === "DEFAULT" || text === "AUTO" || text === "") {
    return "STANDARD";
  }
  if (text === "PRIORITY") return "FAST";
  return text || undefined;
}

function defaultServiceTierOptions(): ServiceTierOption[] {
  return [{ key: "STANDARD", label: "Standard" }];
}

function supportedServiceTiers(model: CoderModelOption | undefined): Set<QueryServiceTier> {
  const supported = new Set<QueryServiceTier>(["STANDARD"]);
  const tiers = Array.isArray(model?.serviceTiers) ? model.serviceTiers : [];
  for (const tier of tiers) {
    const normalized = normalizeServiceTier(tier);
    if (normalized) supported.add(normalized);
  }
  return supported;
}

function translatedOptionLabel(
  prefix: string,
  option: { key: string; label: string },
  t: (key: string) => string,
): string {
  const messageKey = `${prefix}.${option.key}`;
  const translated = t(messageKey);
  return translated === messageKey ? option.label : translated;
}

function itemLabel(content: React.ReactNode): React.ReactElement {
  return React.createElement("span", { className: MENU_ITEM_CLASS }, content);
}

export function buildModelMenuItems({
  models,
  reasoningEfforts,
  serviceTiers = defaultServiceTierOptions(),
  modelOverride,
  selectedModelLabel,
  selectedModelKey,
  selectedReasoningEffort,
  selectedServiceTier,
  modelsLoading = false,
  status = "idle",
  t,
}: {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers?: ServiceTierOption[];
  modelOverride: QueryModelOverride;
  selectedModelLabel?: string;
  selectedModelKey?: string;
  selectedReasoningEffort?: QueryReasoningEffort;
  selectedServiceTier?: QueryServiceTier;
  modelsLoading?: boolean;
  status?: ModelOptionsStatus;
  t: (key: string) => string;
}): MenuProps["items"] {
  const modelStatusItem = models.length > 0
    ? null
    : {
        key: `model-status:${modelsLoading ? "loading" : status}`,
        disabled: true,
        label: itemLabel(
          t(
            modelsLoading
              ? "composer.query.model.loading"
              : status === "failed"
                ? "composer.query.model.loadFailed"
                : "composer.query.model.empty",
          ),
        ),
      };

  const activeModelKey = selectedModelKey || modelOverride.key;
  const modelMenuChildren = [
    ...(modelStatusItem ? [modelStatusItem] : []),
    ...models.map((model) => {
      const key = toText(model.key);
      const presentation = resolveModelPresentation(model);
      return {
        key: `model:${encodeURIComponent(key)}`,
        label: React.createElement(
          "span",
          { className: MODEL_MENU_ITEM_CLASS },
          React.createElement("img", {
            className: `query-model-menu-icon${presentation.isMonochrome ? " is-monochrome" : ""}`,
            src: presentation.icon,
            alt: "",
            "aria-hidden": true,
          }),
          React.createElement(
            "span",
            { className: "query-model-menu-copy" },
            React.createElement("span", { className: "query-model-menu-name" }, toText(model.name)),
            React.createElement("span", { className: "query-model-menu-provider" }, presentation.provider),
          ),
        ),
        extra: activeModelKey === key ? React.createElement(MaterialIcon, { name: "check" }) : null,
      };
    }),
  ];
  const selectedModel = models.find((model) => toText(model.key) === toText(activeModelKey));
  const availableServiceTiers = serviceTiers.filter((option) =>
    supportedServiceTiers(selectedModel).has(normalizeServiceTier(option.key) || "STANDARD"),
  );

  return [
    {
      key: "reasoning",
      type: "group",
      label: t("composer.query.reasoning.group"),
      children: reasoningEfforts.map((option) => ({
        key: `reasoning:${option.key}`,
        label: itemLabel(translatedOptionLabel("composer.query.reasoning", option, t)),
        extra:
          (selectedReasoningEffort || modelOverride.reasoningEffort) === option.key
            ? React.createElement(MaterialIcon, { name: "check" })
            : null,
      })),
    },
    {
      key: "service-tier",
      type: "group",
      label: t("composer.query.serviceTier.group"),
      children: availableServiceTiers.map((option) => ({
        key: `serviceTier:${option.key}`,
        label: itemLabel(translatedOptionLabel("composer.query.serviceTier", option, t)),
        extra:
          (selectedServiceTier || modelOverride.serviceTier || "STANDARD") === option.key
            ? React.createElement(MaterialIcon, { name: "check" })
            : null,
      })),
    },
    {
      key: "model-submenu",
      popupClassName: "query-settings-submenu",
      label: itemLabel(selectedModelLabel || activeModelKey || ""),
      children: [
        {
          key: "models",
          label: t("composer.query.model.group"),
          type: "group",
          children: modelMenuChildren,
        },
      ],
    },
  ];
}

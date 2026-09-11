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
import {
  filterServiceTierOptions,
  getModelDisplayName,
  normalizeModelServiceTier,
  supportedModelServiceTiers,
  toModelOptionText,
  translatedModelOptionLabel,
} from "@/features/model-config/lib/modelOptions";

export type ModelOptionsStatus = "idle" | "loaded" | "empty" | "failed";

const MENU_ITEM_CLASS =
  "query-settings-menu-item tw:inline-flex tw:items-center tw:justify-between tw:gap-1.5 tw:text-[13px] tw:[&_.material-icon]:text-sm";
const MODEL_MENU_ITEM_CLASS = "query-model-menu-item";

function itemLabel(content: React.ReactNode): React.ReactElement {
  return React.createElement("span", { className: MENU_ITEM_CLASS }, content);
}

export function buildModelMenuItems({
  models,
  reasoningEfforts,
  serviceTiers = filterServiceTierOptions([]),
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
  const modelStatusItem = (() => {
    if (models.length > 0) return null;
    if (modelsLoading) {
      return { key: "model-status:loading", disabled: true, label: itemLabel(t("composer.query.model.loading")) };
    }
    if (status === "failed") {
      return { key: "model-status:failed", disabled: true, label: itemLabel(t("composer.query.model.loadFailed")) };
    }
    if (status === "empty") {
      return { key: "model-status:empty", disabled: true, label: itemLabel(t("composer.query.model.empty")) };
    }
    return null;
  })();

  const activeModelKey = selectedModelKey || modelOverride.key;
  const modelMenuChildren = [
    ...(modelStatusItem ? [modelStatusItem] : []),
    ...models.map((model) => {
      const key = toModelOptionText(model.key);
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
            React.createElement("span", { className: "query-model-menu-name" }, getModelDisplayName(model)),
            React.createElement("span", { className: "query-model-menu-provider" }, presentation.provider),
          ),
        ),
        extra: activeModelKey === key ? React.createElement(MaterialIcon, { name: "check" }) : null,
      };
    }),
  ];
  const selectedModel = models.find((model) => toModelOptionText(model.key) === toModelOptionText(activeModelKey));
  const availableServiceTiers = serviceTiers.filter((option) =>
    supportedModelServiceTiers(selectedModel).has(normalizeModelServiceTier(option.key) || "STANDARD"),
  );

  return [
    {
      key: "reasoning",
      type: "group",
      label: t("composer.query.reasoning.group"),
      children: reasoningEfforts.map((option) => ({
        key: `reasoning:${option.key}`,
        label: itemLabel(translatedModelOptionLabel("composer.query.reasoning", option, t)),
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
        label: itemLabel(translatedModelOptionLabel("composer.query.serviceTier", option, t)),
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

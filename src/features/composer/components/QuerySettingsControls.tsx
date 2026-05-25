import React, { useEffect, useMemo, useState } from "react";
import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { getAgentEditorOptions } from "@/features/transport/lib/apiClientProxy";
import type {
  AgentEditorModelOption,
  QueryAccessLevel,
  QueryModelOverride,
  QueryReasoningEffort,
} from "@/shared/api/apiClient";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

interface QuerySettingsControlsProps {
  accessLevel: QueryAccessLevel;
  disabled?: boolean;
  modelOverride: QueryModelOverride;
  onAccessLevelChange: (value: QueryAccessLevel) => void;
  onModelOverrideChange: (value: QueryModelOverride) => void;
}

const ACCESS_LEVELS: QueryAccessLevel[] = [
  "default",
  "auto_approve",
  "full_access",
];

const REASONING_EFFORTS: QueryReasoningEffort[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "XHIGH",
];

function isCoderMode(value: unknown): boolean {
  return String(value || "").trim().toUpperCase() === "CODER";
}

export const QuerySettingsControls: React.FC<QuerySettingsControlsProps> = ({
  accessLevel,
  disabled = false,
  modelOverride,
  onAccessLevelChange,
  onModelOverrideChange,
}) => {
  const state = useAppState();
  const { t } = useI18n();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const isCoderAgent =
    currentWorker?.type === "agent" &&
    (isCoderMode(currentWorker.raw?.mode) || currentWorker.row?.agentType === "coder");
  const [models, setModels] = useState<AgentEditorModelOption[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    if (isCoderAgent || !modelOverride.key && !modelOverride.reasoningEffort) {
      return;
    }
    onModelOverrideChange({});
  }, [isCoderAgent, modelOverride, onModelOverrideChange]);

  useEffect(() => {
    if (!isCoderAgent || modelsLoaded || modelsLoading) {
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    void getAgentEditorOptions()
      .then((response) => {
        if (cancelled) return;
        setModels(Array.isArray(response.data?.models) ? response.data.models : []);
        setModelsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setModelsLoaded(true);
      })
      .finally(() => {
        if (cancelled) return;
        setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCoderAgent, modelsLoaded, modelsLoading]);

  const accessLabel = t(`composer.query.access.${accessLevel}`);
  const accessItems = useMemo<MenuProps["items"]>(
    () =>
      ACCESS_LEVELS.map((value) => ({
        key: value,
        label: (
          <span className="query-settings-menu-item">
            <span>{t(`composer.query.access.${value}`)}</span>
            {value === accessLevel ? <MaterialIcon name="check" /> : null}
          </span>
        ),
      })),
    [accessLevel, t],
  );

  const modelLabelByKey = useMemo(() => {
    const labels = new Map<string, string>();
    for (const model of models) {
      const key = String(model.key || "").trim();
      if (!key) continue;
      labels.set(key, model.modelId ? `${key} · ${model.modelId}` : key);
    }
    return labels;
  }, [models]);

  const selectedModelLabel = modelOverride.key
    ? modelLabelByKey.get(modelOverride.key) || modelOverride.key
    : t("composer.query.model.default");
  const selectedReasoningLabel = modelOverride.reasoningEffort
    ? t(`composer.query.reasoning.${modelOverride.reasoningEffort}`)
    : t("composer.query.reasoning.default");

  const modelItems = useMemo<MenuProps["items"]>(
    () => [
      {
        key: "models",
        type: "group",
        label: t("composer.query.model.group"),
        children: [
          {
            key: "model:",
            label: (
              <span className="query-settings-menu-item">
                <span>{t("composer.query.model.default")}</span>
                {!modelOverride.key ? <MaterialIcon name="check" /> : null}
              </span>
            ),
          },
          ...models.map((model) => {
            const key = String(model.key || "").trim();
            const label = model.modelId ? `${key} · ${model.modelId}` : key;
            return {
              key: `model:${encodeURIComponent(key)}`,
              label: (
                <span className="query-settings-menu-item">
                  <span>{label}</span>
                  {modelOverride.key === key ? <MaterialIcon name="check" /> : null}
                </span>
              ),
            };
          }),
        ],
      },
      {
        key: "reasoning",
        type: "group",
        label: t("composer.query.reasoning.group"),
        children: [
          {
            key: "reasoning:",
            label: (
              <span className="query-settings-menu-item">
                <span>{t("composer.query.reasoning.default")}</span>
                {!modelOverride.reasoningEffort ? (
                  <MaterialIcon name="check" />
                ) : null}
              </span>
            ),
          },
          ...REASONING_EFFORTS.map((effort) => ({
            key: `reasoning:${effort}`,
            label: (
              <span className="query-settings-menu-item">
                <span>{t(`composer.query.reasoning.${effort}`)}</span>
                {modelOverride.reasoningEffort === effort ? (
                  <MaterialIcon name="check" />
                ) : null}
              </span>
            ),
          })),
        ],
      },
    ],
    [modelOverride, models, t],
  );

  const onModelMenuClick: MenuProps["onClick"] = ({ key }) => {
    const textKey = String(key);
    if (textKey.startsWith("model:")) {
      const encoded = textKey.slice("model:".length);
      onModelOverrideChange({
        ...modelOverride,
        key: encoded ? decodeURIComponent(encoded) : undefined,
      });
      return;
    }
    if (textKey.startsWith("reasoning:")) {
      const effort = textKey.slice("reasoning:".length) as QueryReasoningEffort | "";
      onModelOverrideChange({
        ...modelOverride,
        reasoningEffort: effort || undefined,
      });
    }
  };

  return (
    <div className="query-settings-controls">
      <Dropdown
        menu={{
          items: accessItems,
          onClick: ({ key }) => onAccessLevelChange(key as QueryAccessLevel),
          selectedKeys: [accessLevel],
        }}
        placement="topRight"
        trigger={["click"]}
      >
        <UiButton
          className="query-settings-btn"
          variant="secondary"
          size="sm"
          disabled={disabled}
          title={t("composer.query.access.title")}
          onClick={(event) => event.preventDefault()}
        >
          <MaterialIcon name="security" />
          <span>{accessLabel}</span>
          <MaterialIcon name="expand_more" />
        </UiButton>
      </Dropdown>
      {isCoderAgent ? (
        <Dropdown
          menu={{
            items: modelItems,
            onClick: onModelMenuClick,
          }}
          placement="topRight"
          trigger={["click"]}
        >
          <UiButton
            className="query-settings-btn query-model-btn"
            variant="secondary"
            size="sm"
            disabled={disabled}
            loading={modelsLoading}
            title={t("composer.query.model.title")}
            onClick={(event) => event.preventDefault()}
          >
            <MaterialIcon name="psychology" />
            <span>
              {selectedModelLabel} / {selectedReasoningLabel}
            </span>
            <MaterialIcon name="expand_more" />
          </UiButton>
        </Dropdown>
      ) : null}
    </div>
  );
};

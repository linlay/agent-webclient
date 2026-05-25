import React, { useEffect, useMemo, useState } from "react";
import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { getModelOptions } from "@/features/transport/lib/apiClientProxy";
import type {
  CoderModelOption,
  QueryAccessLevel,
  QueryModelOverride,
  QueryReasoningEffort,
  ReasoningEffortOption,
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

type ModelOptionsStatus = "idle" | "loaded" | "empty" | "failed";

type LoadedCoderModelOptions = {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
};

let cachedCoderModelOptions: LoadedCoderModelOptions | null = null;
let pendingCoderModelOptionsPromise: Promise<LoadedCoderModelOptions> | null = null;

function isCoderMode(value: unknown): boolean {
  return String(value || "").trim().toUpperCase() === "CODER";
}

function toText(value: unknown): string {
  return String(value || "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function filterModelOptions(value: unknown): CoderModelOption[] {
  return Array.isArray(value)
    ? value.filter((item): item is CoderModelOption =>
      isRecord(item) && Boolean(toText(item.key)),
    )
    : [];
}

function filterReasoningOptions(value: unknown): ReasoningEffortOption[] {
  return Array.isArray(value)
    ? value.filter((item): item is ReasoningEffortOption =>
      isRecord(item) && Boolean(toText(item.key)),
    )
    : [];
}

export function shouldClearModelOverride(
  isCoderAgent: boolean,
  modelOverride: QueryModelOverride,
): boolean {
  return !isCoderAgent && Boolean(modelOverride.key || modelOverride.reasoningEffort);
}

export function shouldRetryModelOptionsOnOpen({
  open,
  isCoderAgent,
  agentKey,
  modelsLoading,
  status,
  models,
  reasoningEfforts,
}: {
  open: boolean;
  isCoderAgent: boolean;
  agentKey: string;
  modelsLoading: boolean;
  status: ModelOptionsStatus;
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
}): boolean {
  return Boolean(
    open
    && isCoderAgent
    && agentKey
    && !modelsLoading
    && status !== "empty"
    && models.length === 0
    && reasoningEfforts.length === 0,
  );
}

export function buildModelMenuItems({
  models,
  reasoningEfforts,
  modelOverride,
  selectedModelLabel,
  modelsLoading = false,
  status = "idle",
  t,
}: {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  modelOverride: QueryModelOverride;
  selectedModelLabel?: string;
  modelsLoading?: boolean;
  status?: ModelOptionsStatus;
  t: (key: string) => string;
}): MenuProps["items"] {
  const modelStatusItem = (() => {
    if (models.length > 0) return null;
    if (modelsLoading) {
      return {
        key: "model-status:loading",
        disabled: true,
        label: <span className="query-settings-menu-item">{t("composer.query.model.loading")}</span>,
      };
    }
    if (status === "failed") {
      return {
        key: "model-status:failed",
        disabled: true,
        label: <span className="query-settings-menu-item">{t("composer.query.model.loadFailed")}</span>,
      };
    }
    if (status === "empty") {
      return {
        key: "model-status:empty",
        disabled: true,
        label: <span className="query-settings-menu-item">{t("composer.query.model.empty")}</span>,
      };
    }
    return null;
  })();

  const modelMenuChildren = [
    {
      key: "model:",
      label: (
        <span className="query-settings-menu-item">
          <span>{t("composer.query.model.default")}</span>
          {!modelOverride.key ? <MaterialIcon name="check" /> : null}
        </span>
      ),
    },
    ...(modelStatusItem ? [modelStatusItem] : []),
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
  ];
  const resolvedSelectedModelLabel = selectedModelLabel || (
    modelOverride.key || t("composer.query.model.default")
  );

  return [
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
        ...reasoningEfforts.map((option) => ({
          key: `reasoning:${option.key}`,
          label: (
            <span className="query-settings-menu-item">
              <span>
                {t(`composer.query.reasoning.${option.key}`) || option.label}
              </span>
              {modelOverride.reasoningEffort === option.key ? (
                <MaterialIcon name="check" />
              ) : null}
            </span>
          ),
        })),
      ],
    },
    {
      key: "model-submenu",
      label: (
        <span className="query-settings-menu-item">
          <span>
            {t("composer.query.model.group")} · {resolvedSelectedModelLabel}
          </span>
        </span>
      ),
      children: modelMenuChildren,
    },
  ];
}

export function normalizeCoderModelOptionsResponse(response: unknown): {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  recognized: boolean;
} {
  const topLevel = isRecord(response) ? response : {};
  const data = isRecord(topLevel.data) ? topLevel.data : null;
  const nestedData = data && isRecord(data.data) ? data.data : null;
  const candidates = [data, nestedData, isRecord(response) ? response : null].filter(
    (candidate): candidate is Record<string, unknown> => Boolean(candidate),
  );

  for (const candidate of candidates) {
    if (!Array.isArray(candidate.models) && !Array.isArray(candidate.reasoningEfforts)) {
      continue;
    }
    return {
      models: filterModelOptions(candidate.models),
      reasoningEfforts: filterReasoningOptions(candidate.reasoningEfforts),
      recognized: true,
    };
  }

  return {
    models: [],
    reasoningEfforts: [],
    recognized: false,
  };
}

export function clearCoderModelOptionsCacheForTest(): void {
  cachedCoderModelOptions = null;
  pendingCoderModelOptionsPromise = null;
}

export function getCachedCoderModelOptions(): LoadedCoderModelOptions | null {
  return cachedCoderModelOptions;
}

export async function loadCoderModelOptions(): Promise<LoadedCoderModelOptions> {
  if (cachedCoderModelOptions) {
    return cachedCoderModelOptions;
  }
  if (pendingCoderModelOptionsPromise) {
    return pendingCoderModelOptionsPromise;
  }

  pendingCoderModelOptionsPromise = getModelOptions()
    .then((rawResponse) => {
      const options = normalizeCoderModelOptionsResponse(rawResponse);
      if (!options.recognized) {
        console.warn("[QuerySettingsControls] Unrecognized model options response", rawResponse);
      }
      cachedCoderModelOptions = {
        models: options.models,
        reasoningEfforts: options.reasoningEfforts,
      };
      return cachedCoderModelOptions;
    })
    .finally(() => {
      pendingCoderModelOptionsPromise = null;
    });
  return pendingCoderModelOptionsPromise;
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
  const agentKey =
    currentWorker?.type === "agent"
      ? toText(currentWorker.key)
        || toText(currentWorker.sourceId)
        || toText(currentWorker.row?.sourceId)
        || toText(currentWorker.row?.key)
        || toText(currentWorker.raw?.key)
      : "";
  const [models, setModels] = useState<CoderModelOption[]>([]);
  const [reasoningEfforts, setReasoningEfforts] = useState<ReasoningEffortOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptionsStatus, setModelOptionsStatus] = useState<ModelOptionsStatus>("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!shouldClearModelOverride(isCoderAgent, modelOverride)) {
      return;
    }
    onModelOverrideChange({});
  }, [isCoderAgent, modelOverride, onModelOverrideChange]);

  useEffect(() => {
    if (!isCoderAgent || !agentKey) {
      setModels([]);
      setReasoningEfforts([]);
      setModelsLoading(false);
      setModelOptionsStatus("idle");
      return;
    }
    const cachedOptions = getCachedCoderModelOptions();
    if (cachedOptions) {
      setModels(cachedOptions.models);
      setReasoningEfforts(cachedOptions.reasoningEfforts);
      setModelsLoading(false);
      setModelOptionsStatus(
        cachedOptions.models.length > 0 || cachedOptions.reasoningEfforts.length > 0
          ? "loaded"
          : "empty",
      );
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    setModelOptionsStatus("idle");
    void loadCoderModelOptions()
      .then((options) => {
        if (cancelled) return;
        setModels(options.models);
        setReasoningEfforts(options.reasoningEfforts);
        setModelOptionsStatus(
          options.models.length > 0 || options.reasoningEfforts.length > 0 ? "loaded" : "empty",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setReasoningEfforts([]);
        setModelOptionsStatus("failed");
      })
      .finally(() => {
        if (cancelled) return;
        setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentKey, isCoderAgent, loadAttempt]);

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
    () => buildModelMenuItems({
      models,
      reasoningEfforts,
      modelOverride,
      selectedModelLabel,
      modelsLoading,
      status: modelOptionsStatus,
      t,
    }),
    [modelOverride, modelOptionsStatus, models, modelsLoading, reasoningEfforts, t],
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

  const onModelMenuOpenChange = (open: boolean) => {
    if (!shouldRetryModelOptionsOnOpen({
      open,
      isCoderAgent,
      agentKey,
      modelsLoading,
      status: modelOptionsStatus,
      models,
      reasoningEfforts,
    })) {
      return;
    }
    setModelOptionsStatus("idle");
    setLoadAttempt((attempt) => attempt + 1);
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
          onOpenChange={onModelMenuOpenChange}
          placement="topRight"
          trigger={["click"]}
        >
          <UiButton
            className={`query-settings-btn query-model-btn ${modelsLoading ? "is-loading" : ""}`.trim()}
            variant="secondary"
            size="sm"
            disabled={disabled}
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

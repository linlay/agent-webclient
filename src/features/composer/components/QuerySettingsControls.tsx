import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { useAppState } from "@/app/state/AppContext";
import {
  resolveCurrentWorkerSummary,
  type CurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
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
  defaultModelKey?: string;
  defaultReasoningEffort?: QueryReasoningEffort;
};

let cachedCoderModelOptions: LoadedCoderModelOptions | null = null;
let pendingCoderModelOptionsPromise: Promise<LoadedCoderModelOptions> | null = null;

function isCoderMode(value: unknown): boolean {
  return String(value || "").trim().toUpperCase() === "CODER";
}

function toText(value: unknown): string {
  return String(value || "").trim();
}

function toConfigText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function getModelKey(value: unknown): string {
  const direct = toConfigText(value);
  if (direct) return direct;
  if (!isRecord(value)) return "";
  return toConfigText(value.key) || toConfigText(value.modelKey) || toConfigText(value.id);
}

function normalizeReasoningEffort(value: unknown): QueryReasoningEffort | undefined {
  const text = toConfigText(value).toUpperCase();
  if (text === "NONE" || text === "LOW" || text === "MEDIUM" || text === "HIGH") {
    return text;
  }
  return undefined;
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
  selectedModelKey,
  selectedReasoningEffort,
  modelsLoading = false,
  status = "idle",
  t,
}: {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  modelOverride: QueryModelOverride;
  selectedModelLabel?: string;
  selectedModelKey?: string;
  selectedReasoningEffort?: QueryReasoningEffort;
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
    ...(modelStatusItem ? [modelStatusItem] : []),
    ...models.map((model) => {
      const key = String(model.key || "").trim();
      const label = model.modelId ? `${key} · ${model.modelId}` : key;
      return {
        key: `model:${encodeURIComponent(key)}`,
        label: (
          <span className="query-settings-menu-item">
            <span>{label}</span>
            {(selectedModelKey || modelOverride.key) === key ? (
              <MaterialIcon name="check" />
            ) : null}
          </span>
        ),
      };
    }),
  ];
  const resolvedSelectedModelLabel = selectedModelLabel || selectedModelKey || modelOverride.key || "";

  return [
    {
      key: "reasoning",
      type: "group",
      label: t("composer.query.reasoning.group"),
      children: reasoningEfforts.map((option) => ({
        key: `reasoning:${option.key}`,
        label: (
          <span className="query-settings-menu-item">
            <span>
              {t(`composer.query.reasoning.${option.key}`) || option.label}
            </span>
            {(selectedReasoningEffort || modelOverride.reasoningEffort) === option.key ? (
              <MaterialIcon name="check" />
            ) : null}
          </span>
        ),
      })),
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
  defaultModelKey?: string;
  defaultReasoningEffort?: QueryReasoningEffort;
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
      defaultModelKey: getModelKey(candidate.defaultModelKey),
      defaultReasoningEffort: normalizeReasoningEffort(candidate.defaultReasoningEffort),
      recognized: true,
    };
  }

  return {
    models: [],
    reasoningEfforts: [],
    recognized: false,
  };
}

export function resolveCoderAgentDefaultModelOverride(
  currentWorker: Pick<CurrentWorkerSummary, "raw"> | null | undefined,
  options: Pick<LoadedCoderModelOptions, "defaultModelKey" | "defaultReasoningEffort"> | null | undefined,
): QueryModelOverride {
  const raw = getRecord(currentWorker?.raw);
  const meta = getRecord(raw.meta);
  const modelConfig = getRecord(raw.modelConfig);
  const definition = getRecord(raw.definition);
  const definitionModelConfig = getRecord(definition.modelConfig);

  const key =
    getModelKey(raw.modelKey)
    || getModelKey(meta.modelKey)
    || getModelKey(modelConfig.modelKey)
    || getModelKey(definitionModelConfig.modelKey)
    || getModelKey(raw.model)
    || getModelKey(options?.defaultModelKey);
  const reasoningEffort =
    normalizeReasoningEffort(raw.reasoningEffort)
    || normalizeReasoningEffort(meta.reasoningEffort)
    || normalizeReasoningEffort(modelConfig.reasoningEffort)
    || normalizeReasoningEffort(definitionModelConfig.reasoningEffort)
    || normalizeReasoningEffort(options?.defaultReasoningEffort);

  return {
    ...(key ? { key } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
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
        defaultModelKey: options.defaultModelKey,
        defaultReasoningEffort: options.defaultReasoningEffort,
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
  const [modelDefaults, setModelDefaults] = useState<Pick<
    LoadedCoderModelOptions,
    "defaultModelKey" | "defaultReasoningEffort"
  >>({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptionsStatus, setModelOptionsStatus] = useState<ModelOptionsStatus>("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const appliedDefaultRef = useRef<{
    agentKey: string;
    value: QueryModelOverride;
  } | null>(null);

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
      setModelDefaults({});
      setModelsLoading(false);
      setModelOptionsStatus("idle");
      return;
    }
    const cachedOptions = getCachedCoderModelOptions();
    if (cachedOptions) {
      setModels(cachedOptions.models);
      setReasoningEfforts(cachedOptions.reasoningEfforts);
      setModelDefaults({
        defaultModelKey: cachedOptions.defaultModelKey,
        defaultReasoningEffort: cachedOptions.defaultReasoningEffort,
      });
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
        setModelDefaults({
          defaultModelKey: options.defaultModelKey,
          defaultReasoningEffort: options.defaultReasoningEffort,
        });
        setModelOptionsStatus(
          options.models.length > 0 || options.reasoningEfforts.length > 0 ? "loaded" : "empty",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setReasoningEfforts([]);
        setModelDefaults({});
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

  const resolvedDefaultOverride = useMemo(
    () => resolveCoderAgentDefaultModelOverride(currentWorker, modelDefaults),
    [currentWorker, modelDefaults],
  );

  useEffect(() => {
    if (!isCoderAgent || !agentKey) return;
    if (!resolvedDefaultOverride.key && !resolvedDefaultOverride.reasoningEffort) return;

    const previous = appliedDefaultRef.current;
    const currentMatchesPrevious =
      previous?.agentKey === agentKey
      && modelOverride.key === previous.value.key
      && modelOverride.reasoningEffort === previous.value.reasoningEffort;
    if (previous?.agentKey === agentKey && !currentMatchesPrevious) {
      return;
    }
    if (
      modelOverride.key === resolvedDefaultOverride.key
      && modelOverride.reasoningEffort === resolvedDefaultOverride.reasoningEffort
    ) {
      appliedDefaultRef.current = {
        agentKey,
        value: resolvedDefaultOverride,
      };
      return;
    }

    appliedDefaultRef.current = {
      agentKey,
      value: resolvedDefaultOverride,
    };
    onModelOverrideChange(resolvedDefaultOverride);
  }, [
    agentKey,
    isCoderAgent,
    modelOverride.key,
    modelOverride.reasoningEffort,
    onModelOverrideChange,
    resolvedDefaultOverride,
  ]);

  const selectedModelKey = modelOverride.key || resolvedDefaultOverride.key || "";
  const selectedReasoningEffort =
    modelOverride.reasoningEffort || resolvedDefaultOverride.reasoningEffort;
  const selectedModelLabel = selectedModelKey
    ? modelLabelByKey.get(selectedModelKey) || selectedModelKey
    : t("composer.query.model.loading");
  const selectedReasoningLabel = selectedReasoningEffort
    ? t(`composer.query.reasoning.${selectedReasoningEffort}`)
    : t("composer.query.model.loading");

  const modelItems = useMemo<MenuProps["items"]>(
    () => buildModelMenuItems({
      models,
      reasoningEfforts,
      modelOverride,
      selectedModelLabel,
      selectedModelKey,
      selectedReasoningEffort,
      modelsLoading,
      status: modelOptionsStatus,
      t,
    }),
    [
      modelOverride,
      modelOptionsStatus,
      models,
      modelsLoading,
      reasoningEfforts,
      selectedModelKey,
      selectedModelLabel,
      selectedReasoningEffort,
      t,
    ],
  );

  const onModelMenuClick: MenuProps["onClick"] = ({ key }) => {
    const textKey = String(key);
    if (textKey.startsWith("model:")) {
      const encoded = textKey.slice("model:".length);
      if (!encoded) return;
      onModelOverrideChange({
        ...modelOverride,
        key: decodeURIComponent(encoded),
      });
      return;
    }
    if (textKey.startsWith("reasoning:")) {
      const effort = normalizeReasoningEffort(textKey.slice("reasoning:".length));
      if (!effort) return;
      onModelOverrideChange({
        ...modelOverride,
        reasoningEffort: effort,
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/app/state/types";
import {
  resolveCurrentWorkerSummary,
  type CurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
import {
  getModelOptions,
  updateAgentModelConfig,
} from "@/shared/data";
import type {
  AgentModelConfigResponse,
  CoderModelOption,
  QueryAccessLevel,
  QueryModelOverride,
  QueryReasoningEffort,
  QueryServiceTier,
  ReasoningEffortOption,
  ServiceTierOption,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

interface QuerySettingsControlsProps {
  accessLevel: QueryAccessLevel;
  disabled?: boolean;
  modelOverride: QueryModelOverride;
  onAccessLevelChange: (value: QueryAccessLevel) => void;
  onModelOverrideChange: (value: QueryModelOverride) => void;
  showModelSelector?: boolean;
}

const ACCESS_LEVELS: QueryAccessLevel[] = [
  "default",
  "auto_approve",
  "full_access",
];

const ACCESS_LEVEL_ICON: Record<QueryAccessLevel, MaterialIconName> = {
  default: "front_hand",
  auto_approve: "verified_user",
  full_access: "gpp_maybe",
};
const ACCESS_LEVEL_COLOR: Record<QueryAccessLevel, string> = {
  default: "",
  auto_approve: "color-mix(in srgb, var(--accent-warn) 72%, transparent)",
  full_access: "color-mix(in srgb, var(--accent-danger) 72%, transparent)",
};

type ModelOptionsStatus = "idle" | "loaded" | "empty" | "failed";

type LoadedCoderModelOptions = {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers: ServiceTierOption[];
  defaultModelKey?: string;
  defaultReasoningEffort?: QueryReasoningEffort;
  defaultServiceTier?: QueryServiceTier;
};

type AppliedDefaultModelOverride = {
  agentKey: string;
  value: QueryModelOverride;
};

const globalCoderModelOptionsCacheKey = "__global__";
const cachedCoderModelOptions = new Map<string, LoadedCoderModelOptions>();
const pendingCoderModelOptionsPromises = new Map<
  string,
  Promise<LoadedCoderModelOptions>
>();

function isCoderMode(value: unknown): boolean {
  return (
    String(value || "")
      .trim()
      .toUpperCase() === "CODER"
  );
}

function toText(value: unknown): string {
  return String(value || "").trim();
}

export function toAgentConfigKey(value: unknown): string {
  const key = toText(value);
  return key.startsWith("agent:") ? key.slice("agent:".length).trim() : key;
}

function toConfigText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function modelOptionsCacheKey(agentKey = ""): string {
  return toAgentConfigKey(agentKey) || globalCoderModelOptionsCacheKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function getModelKey(value: unknown): string {
  const direct = toConfigText(value);
  if (direct) return direct;
  if (!isRecord(value)) return "";
  return (
    toConfigText(value.key) ||
    toConfigText(value.modelKey) ||
    toConfigText(value.id)
  );
}

function getModelDisplayName(model: CoderModelOption): string {
  return toConfigText(model.name);
}

function normalizeModelIdentityText(value: unknown): string {
  return toConfigText(value)
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

function getModelIdentityFamily(value: string): "deepseek" | "qwen" | "" {
  if (value.includes("deepseek")) return "deepseek";
  if (value.includes("qwen")) return "qwen";
  return "";
}

export function getModelIdentityMismatchWarning(
  model: CoderModelOption,
): string {
  const displayText = normalizeModelIdentityText(model.name);
  if (!displayText) return "";

  const technicalText = [model.key, model.modelId, model.provider]
    .map(normalizeModelIdentityText)
    .filter(Boolean)
    .join(" ");
  if (!technicalText) return "";

  const displayFamily = getModelIdentityFamily(displayText);
  const technicalFamily = getModelIdentityFamily(technicalText);
  if (!displayFamily || !technicalFamily || displayFamily === technicalFamily) {
    return "";
  }

  return `[QuerySettingsControls] Model option identity mismatch: display name "${toConfigText(model.name)}" is ${displayFamily}, but key/modelId/provider "${[
    model.key,
    model.modelId,
    model.provider,
  ]
    .map(toConfigText)
    .filter(Boolean)
    .join(" / ")}" is ${technicalFamily}`;
}

function normalizeReasoningEffort(
  value: unknown,
): QueryReasoningEffort | undefined {
  const text = toConfigText(value).toUpperCase();
  if (
    text === "NONE" ||
    text === "LOW" ||
    text === "MEDIUM" ||
    text === "HIGH" ||
    text === "XHIGH" ||
    text === "MAX"
  ) {
    return text;
  }
  if (text === "EXTRA_HIGH") {
    return "XHIGH";
  }
  return undefined;
}

function normalizeServiceTier(value: unknown): QueryServiceTier | undefined {
  const text = toConfigText(value).toUpperCase();
  if (
    text === "STANDARD" ||
    text === "DEFAULT" ||
    text === "AUTO" ||
    text === ""
  ) {
    return "STANDARD";
  }
  if (text === "PRIORITY") return "FAST";
  return text || undefined;
}

function filterModelOptions(value: unknown): CoderModelOption[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is CoderModelOption =>
          isRecord(item) && Boolean(toText(item.key)) && Boolean(toConfigText(item.name)),
      )
    : [];
}

function filterReasoningOptions(value: unknown): ReasoningEffortOption[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ReasoningEffortOption =>
          isRecord(item) && Boolean(toText(item.key)),
      )
    : [];
}

function filterServiceTierOptions(value: unknown): ServiceTierOption[] {
  const seen = new Set<string>(["STANDARD"]);
  const parsed: ServiceTierOption[] = [{ key: "STANDARD", label: "Standard" }];
  if (!Array.isArray(value)) {
    return parsed;
  }
  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = normalizeServiceTier(item.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parsed.push({ key, label: toConfigText(item.label) || key });
  }
  return parsed;
}

function normalizeModelServiceTiers(model: CoderModelOption | undefined): Set<QueryServiceTier> {
  const supported = new Set<QueryServiceTier>(["STANDARD"]);
  const tiers = Array.isArray(model?.serviceTiers) ? model.serviceTiers : [];
  for (const tier of tiers) {
    const normalized = normalizeServiceTier(tier);
    if (normalized && normalized !== "STANDARD") {
      supported.add(normalized);
    }
  }
  return supported;
}

function serviceTierSupportedByModel(
  tier: QueryServiceTier | undefined,
  model: CoderModelOption | undefined,
): boolean {
  const normalized = normalizeServiceTier(tier) || "STANDARD";
  return normalizeModelServiceTiers(model).has(normalized);
}

function serviceTierLabelText(
  option: ServiceTierOption,
  t: (key: string) => string,
): string {
  const messageKey = `composer.query.serviceTier.${option.key}`;
  const translated = t(messageKey);
  return translated === messageKey ? option.label : translated;
}

export function shouldClearModelOverride(
  isCoderAgent: boolean,
  modelOverride: QueryModelOverride,
): boolean {
  return (
    !isCoderAgent &&
    Boolean(
      modelOverride.key ||
        modelOverride.reasoningEffort ||
        modelOverride.serviceTier,
    )
  );
}

export function shouldApplyCoderDefaultModelOverride({
  shouldShowModelControls,
  agentKey,
  modelOverride,
  resolvedDefaultOverride,
  previousAppliedDefault,
}: {
  shouldShowModelControls: boolean;
  agentKey: string;
  modelOverride: QueryModelOverride;
  resolvedDefaultOverride: QueryModelOverride;
  previousAppliedDefault: AppliedDefaultModelOverride | null;
}): boolean {
  if (!shouldShowModelControls || !agentKey) return false;
  if (
    !resolvedDefaultOverride.key &&
    !resolvedDefaultOverride.reasoningEffort &&
    !resolvedDefaultOverride.serviceTier
  ) {
    return false;
  }
  if (
    modelOverride.key === resolvedDefaultOverride.key &&
    modelOverride.reasoningEffort === resolvedDefaultOverride.reasoningEffort &&
    modelOverride.serviceTier === resolvedDefaultOverride.serviceTier
  ) {
    return false;
  }

  const hasCurrentOverride = Boolean(
    modelOverride.key || modelOverride.reasoningEffort || modelOverride.serviceTier,
  );
  const currentMatchesPrevious =
    previousAppliedDefault?.agentKey === agentKey &&
    modelOverride.key === previousAppliedDefault.value.key &&
    modelOverride.reasoningEffort ===
      previousAppliedDefault.value.reasoningEffort &&
    modelOverride.serviceTier === previousAppliedDefault.value.serviceTier;

  return !(
    previousAppliedDefault?.agentKey === agentKey &&
    !currentMatchesPrevious &&
    hasCurrentOverride
  );
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
    open &&
    isCoderAgent &&
    agentKey &&
    !modelsLoading &&
    status !== "empty" &&
    models.length === 0 &&
    reasoningEfforts.length === 0,
  );
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
      return {
        key: "model-status:loading",
        disabled: true,
        label: (
          <span className="query-settings-menu-item">
            {t("composer.query.model.loading")}
          </span>
        ),
      };
    }
    if (status === "failed") {
      return {
        key: "model-status:failed",
        disabled: true,
        label: (
          <span className="query-settings-menu-item">
            {t("composer.query.model.loadFailed")}
          </span>
        ),
      };
    }
    if (status === "empty") {
      return {
        key: "model-status:empty",
        disabled: true,
        label: (
          <span className="query-settings-menu-item">
            {t("composer.query.model.empty")}
          </span>
        ),
      };
    }
    return null;
  })();

  const modelMenuChildren = [
    ...(modelStatusItem ? [modelStatusItem] : []),
    ...models.map((model) => {
      const key = String(model.key || "").trim();
      const label = getModelDisplayName(model);
      return {
        key: `model:${encodeURIComponent(key)}`,
        label: <span className="query-settings-menu-item">{label}</span>,
        extra:
          (selectedModelKey || modelOverride.key) === key ? (
            <MaterialIcon name="check" />
          ) : null,
      };
    }),
  ];
  const resolvedSelectedModelLabel =
    selectedModelLabel || selectedModelKey || modelOverride.key || "";
  const selectedModel = models.find((model) => toText(model.key) === toText(selectedModelKey || modelOverride.key));
  const availableServiceTiers = serviceTiers.filter((option) =>
    serviceTierSupportedByModel(option.key, selectedModel),
  );

  return [
    {
      key: "reasoning",
      type: "group",
      label: t("composer.query.reasoning.group"),
      children: reasoningEfforts.map((option) => ({
        key: `reasoning:${option.key}`,
        label: (
          <span className="query-settings-menu-item">
            {t(`composer.query.reasoning.${option.key}`) || option.label}
          </span>
        ),
        extra:
          (selectedReasoningEffort || modelOverride.reasoningEffort) ===
          option.key ? (
            <MaterialIcon name="check" />
          ) : null,
      })),
    },
    {
      key: "service-tier",
      type: "group",
      label: t("composer.query.serviceTier.group"),
      children: availableServiceTiers.map((option) => ({
        key: `serviceTier:${option.key}`,
        label: (
          <span className="query-settings-menu-item">
            {serviceTierLabelText(option, t)}
          </span>
        ),
        extra:
          (selectedServiceTier || modelOverride.serviceTier || "STANDARD") ===
          option.key ? (
            <MaterialIcon name="check" />
          ) : null,
      })),
    },
    {
      key: "model-submenu",
      popupClassName: "query-settings-submenu",
      label: (
        <span className="query-settings-menu-item">
          <span>{resolvedSelectedModelLabel}</span>
        </span>
      ),
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

export function normalizeCoderModelOptionsResponse(response: unknown): {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers: ServiceTierOption[];
  defaultModelKey?: string;
  defaultReasoningEffort?: QueryReasoningEffort;
  defaultServiceTier?: QueryServiceTier;
  recognized: boolean;
} {
  const topLevel = isRecord(response) ? response : {};
  const data = isRecord(topLevel.data) ? topLevel.data : null;
  const nestedData = data && isRecord(data.data) ? data.data : null;
  const candidates = [
    data,
    nestedData,
    isRecord(response) ? response : null,
  ].filter((candidate): candidate is Record<string, unknown> =>
    Boolean(candidate),
  );

  for (const candidate of candidates) {
    if (
      !Array.isArray(candidate.models) &&
      !Array.isArray(candidate.reasoningEfforts)
    ) {
      continue;
    }
    const models = filterModelOptions(candidate.models);
    for (const model of models) {
      const warning = getModelIdentityMismatchWarning(model);
      if (warning) {
        console.warn(warning, model);
      }
    }
    return {
      models,
      reasoningEfforts: filterReasoningOptions(candidate.reasoningEfforts),
      serviceTiers: filterServiceTierOptions(candidate.serviceTiers),
      defaultModelKey: getModelKey(candidate.defaultModelKey),
      defaultReasoningEffort: normalizeReasoningEffort(
        candidate.defaultReasoningEffort,
      ),
      defaultServiceTier: normalizeServiceTier(candidate.defaultServiceTier),
      recognized: true,
    };
  }

  return {
    models: [],
    reasoningEfforts: [],
    serviceTiers: filterServiceTierOptions([]),
    recognized: false,
  };
}

function toLoadedCoderModelOptions(options: {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers: ServiceTierOption[];
  defaultModelKey?: string;
  defaultReasoningEffort?: QueryReasoningEffort;
  defaultServiceTier?: QueryServiceTier;
}): LoadedCoderModelOptions {
  return {
    models: options.models,
    reasoningEfforts: options.reasoningEfforts,
    serviceTiers: options.serviceTiers,
    defaultModelKey: options.defaultModelKey,
    defaultReasoningEffort: options.defaultReasoningEffort,
    defaultServiceTier: options.defaultServiceTier,
  };
}

export function resolveEmbeddedCoderModelOptions(
  rawAgent: unknown,
): LoadedCoderModelOptions | null {
  const raw = getRecord(rawAgent);
  if (!Object.prototype.hasOwnProperty.call(raw, "modelOptions")) {
    return null;
  }
  const options = normalizeCoderModelOptionsResponse(raw.modelOptions);
  if (!options.recognized) {
    console.warn(
      "[QuerySettingsControls] Unrecognized embedded model options response",
      raw.modelOptions,
    );
  }
  return toLoadedCoderModelOptions(options);
}

export function resolveCoderAgentDefaultModelOverride(
  currentWorker: Pick<CurrentWorkerSummary, "raw"> | null | undefined,
  options:
    | Pick<
        LoadedCoderModelOptions,
        "defaultModelKey" | "defaultReasoningEffort" | "defaultServiceTier"
      >
    | null
    | undefined,
): QueryModelOverride {
  const raw = getRecord(currentWorker?.raw);
  const meta = getRecord(raw.meta);
  const modelConfig = getRecord(raw.modelConfig);
  const definition = getRecord(raw.definition);
  const definitionModelConfig = getRecord(definition.modelConfig);

  const key =
    getModelKey(raw.modelKey) ||
    getModelKey(raw.defaultModelKey) ||
    getModelKey(meta.modelKey) ||
    getModelKey(modelConfig.modelKey) ||
    getModelKey(definitionModelConfig.modelKey) ||
    getModelKey(raw.model) ||
    getModelKey(options?.defaultModelKey);
  const reasoningEffort =
    normalizeReasoningEffort(raw.reasoningEffort) ||
    normalizeReasoningEffort(raw.defaultReasoningEffort) ||
    normalizeReasoningEffort(meta.reasoningEffort) ||
    normalizeReasoningEffort(modelConfig.reasoningEffort) ||
    normalizeReasoningEffort(definitionModelConfig.reasoningEffort) ||
    normalizeReasoningEffort(options?.defaultReasoningEffort);
  const serviceTier =
    normalizeServiceTier(raw.serviceTier) ||
    normalizeServiceTier(raw.defaultServiceTier) ||
    normalizeServiceTier(meta.serviceTier) ||
    normalizeServiceTier(modelConfig.serviceTier) ||
    normalizeServiceTier(definitionModelConfig.serviceTier) ||
    normalizeServiceTier(options?.defaultServiceTier);

  return {
    ...(key ? { key } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(serviceTier && serviceTier !== "STANDARD" ? { serviceTier } : {}),
  };
}

export function clearCoderModelOptionsCacheForTest(): void {
  cachedCoderModelOptions.clear();
  pendingCoderModelOptionsPromises.clear();
}

export function getCachedCoderModelOptions(
  agentKey = "",
): LoadedCoderModelOptions | null {
  return cachedCoderModelOptions.get(modelOptionsCacheKey(agentKey)) || null;
}

export async function loadCoderModelOptions(
  agentKey = "",
): Promise<LoadedCoderModelOptions> {
  const cacheKey = modelOptionsCacheKey(agentKey);
  const cachedOptions = cachedCoderModelOptions.get(cacheKey);
  if (cachedOptions) {
    return cachedOptions;
  }
  const pendingOptions = pendingCoderModelOptionsPromises.get(cacheKey);
  if (pendingOptions) {
    return pendingOptions;
  }

  const requestAgentKey = toAgentConfigKey(agentKey) || undefined;
  const nextPromise = getModelOptions(requestAgentKey)
    .then((rawResponse) => {
      const options = normalizeCoderModelOptionsResponse(rawResponse);
      if (!options.recognized) {
        console.warn(
          "[QuerySettingsControls] Unrecognized model options response",
          rawResponse,
        );
      }
      const loadedOptions = toLoadedCoderModelOptions(options);
      cachedCoderModelOptions.set(cacheKey, loadedOptions);
      return loadedOptions;
    })
    .finally(() => {
      pendingCoderModelOptionsPromises.delete(cacheKey);
    });
  pendingCoderModelOptionsPromises.set(cacheKey, nextPromise);
  return nextPromise;
}

export function buildPersistedModelConfigOverride({
  current,
  patch,
  defaults,
}: {
  current: QueryModelOverride;
  patch: QueryModelOverride;
  defaults: Pick<
    LoadedCoderModelOptions,
    "defaultModelKey" | "defaultReasoningEffort" | "defaultServiceTier"
  >;
}): QueryModelOverride {
  const key = patch.key || current.key || defaults.defaultModelKey || "";
  const reasoningEffort =
    patch.reasoningEffort ||
    current.reasoningEffort ||
    defaults.defaultReasoningEffort ||
    "MEDIUM";
  const hasPatchServiceTier = Object.prototype.hasOwnProperty.call(
    patch,
    "serviceTier",
  );
  const serviceTier = hasPatchServiceTier
    ? patch.serviceTier
    : current.serviceTier;
  return {
    ...(key ? { key } : {}),
    reasoningEffort,
    ...(serviceTier ? { serviceTier } : {}),
  };
}

export function agentSummaryFromModelConfig(
  existing: Agent | undefined,
  response: AgentModelConfigResponse,
  modelOverride: QueryModelOverride,
): Agent {
  const key = response.key || existing?.key || "";
  const definition = cloneRecord(existing?.definition);
  const definitionModelConfig = cloneRecord(response.modelConfig);
  definition.modelConfig = definitionModelConfig;
  const meta = cloneRecord(existing?.meta);
  const nextModelKey =
    modelOverride.key || getModelKey(definitionModelConfig.modelKey) || "";
  if (nextModelKey) meta.modelKey = nextModelKey;
  if (modelOverride.reasoningEffort) {
    meta.reasoningEffort = modelOverride.reasoningEffort;
  }
  if (modelOverride.serviceTier) {
    meta.serviceTier = modelOverride.serviceTier;
  } else {
    delete meta.serviceTier;
  }
  return {
    ...(existing || {}),
    key,
    name: existing?.name || key,
    model: nextModelKey || existing?.model,
    modelKey: nextModelKey || existing?.modelKey,
    defaultModelKey: nextModelKey || existing?.defaultModelKey,
    defaultReasoningEffort: modelOverride.reasoningEffort,
    defaultServiceTier: modelOverride.serviceTier || "STANDARD",
    definition,
    modelConfig: definitionModelConfig,
    meta,
  };
}

export const QuerySettingsControls: React.FC<QuerySettingsControlsProps> = ({
  accessLevel,
  disabled = false,
  modelOverride,
  onAccessLevelChange,
  onModelOverrideChange,
  showModelSelector = true,
}) => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const isCoderAgent =
    currentWorker?.type === "agent" &&
    (isCoderMode(currentWorker.raw?.mode) ||
      currentWorker.row?.agentType === "coder");
  const shouldShowModelControls = showModelSelector && isCoderAgent;
  const agentKey =
    currentWorker?.type === "agent"
      ? toAgentConfigKey(currentWorker.sourceId) ||
        toAgentConfigKey(currentWorker.row?.sourceId) ||
        toAgentConfigKey(currentWorker.raw?.key) ||
        toAgentConfigKey(currentWorker.key) ||
        toAgentConfigKey(currentWorker.row?.key)
      : "";
  const embeddedModelOptions = useMemo(
    () => resolveEmbeddedCoderModelOptions(currentWorker?.raw),
    [currentWorker?.raw],
  );
  const [models, setModels] = useState<CoderModelOption[]>([]);
  const [reasoningEfforts, setReasoningEfforts] = useState<
    ReasoningEffortOption[]
  >([]);
  const [serviceTiers, setServiceTiers] = useState<ServiceTierOption[]>(filterServiceTierOptions([]));
  const [modelDefaults, setModelDefaults] = useState<
    Pick<
      LoadedCoderModelOptions,
      "defaultModelKey" | "defaultReasoningEffort" | "defaultServiceTier"
    >
  >({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptionsStatus, setModelOptionsStatus] =
    useState<ModelOptionsStatus>("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [modelConfigSaving, setModelConfigSaving] = useState(false);
  const [modelConfigError, setModelConfigError] = useState("");
  const appliedDefaultRef = useRef<AppliedDefaultModelOverride | null>(null);

  useEffect(() => {
    if (!showModelSelector) {
      return;
    }
    if (!shouldClearModelOverride(isCoderAgent, modelOverride)) {
      return;
    }
    appliedDefaultRef.current = null;
    onModelOverrideChange({});
  }, [isCoderAgent, modelOverride, onModelOverrideChange, showModelSelector]);

  useEffect(() => {
    if (!shouldShowModelControls || !agentKey) {
      setModels([]);
      setReasoningEfforts([]);
      setServiceTiers(filterServiceTierOptions([]));
      setModelDefaults({});
      setModelsLoading(false);
      setModelOptionsStatus("idle");
      return;
    }
    if (embeddedModelOptions) {
      setModels(embeddedModelOptions.models);
      setReasoningEfforts(embeddedModelOptions.reasoningEfforts);
      setServiceTiers(embeddedModelOptions.serviceTiers);
      setModelDefaults({
        defaultModelKey: embeddedModelOptions.defaultModelKey,
        defaultReasoningEffort: embeddedModelOptions.defaultReasoningEffort,
        defaultServiceTier: embeddedModelOptions.defaultServiceTier,
      });
      setModelsLoading(false);
      setModelOptionsStatus(
        embeddedModelOptions.models.length > 0 ||
          embeddedModelOptions.reasoningEfforts.length > 0
          ? "loaded"
          : "empty",
      );
      return;
    }
    const cachedOptions = getCachedCoderModelOptions(agentKey);
    if (cachedOptions) {
      setModels(cachedOptions.models);
      setReasoningEfforts(cachedOptions.reasoningEfforts);
      setServiceTiers(cachedOptions.serviceTiers);
      setModelDefaults({
        defaultModelKey: cachedOptions.defaultModelKey,
        defaultReasoningEffort: cachedOptions.defaultReasoningEffort,
        defaultServiceTier: cachedOptions.defaultServiceTier,
      });
      setModelsLoading(false);
      setModelOptionsStatus(
        cachedOptions.models.length > 0 ||
          cachedOptions.reasoningEfforts.length > 0
          ? "loaded"
          : "empty",
      );
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    setModelOptionsStatus("idle");
    void loadCoderModelOptions(agentKey)
      .then((options) => {
        if (cancelled) return;
        setModels(options.models);
        setReasoningEfforts(options.reasoningEfforts);
        setServiceTiers(options.serviceTiers);
        setModelDefaults({
          defaultModelKey: options.defaultModelKey,
          defaultReasoningEffort: options.defaultReasoningEffort,
          defaultServiceTier: options.defaultServiceTier,
        });
        setModelOptionsStatus(
          options.models.length > 0 || options.reasoningEfforts.length > 0
            ? "loaded"
            : "empty",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setReasoningEfforts([]);
        setServiceTiers(filterServiceTierOptions([]));
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
  }, [agentKey, embeddedModelOptions, shouldShowModelControls, loadAttempt]);

  const accessLabel = t(`composer.query.access.${accessLevel}`);
  const accessItems = useMemo<MenuProps["items"]>(
    () =>
      ACCESS_LEVELS.map((value) => ({
        key: value,
        label: (
          <span
            className={`query-settings-access-item query-settings-access-item-${value}`}
          >
            <span className="query-settings-menu-item">
              <MaterialIcon name={ACCESS_LEVEL_ICON[value]} />
              <span>{t(`composer.query.access.${value}`)}</span>
            </span>
          </span>
        ),
        extra: value === accessLevel ? <MaterialIcon name="check" /> : null,
      })),
    [accessLevel, t],
  );

  const modelLabelByKey = useMemo(() => {
    const labels = new Map<string, string>();
    for (const model of models) {
      const key = String(model.key || "").trim();
      if (!key) continue;
      labels.set(key, getModelDisplayName(model));
    }
    return labels;
  }, [models]);

  const resolvedDefaultOverride = useMemo(
    () => resolveCoderAgentDefaultModelOverride(currentWorker, modelDefaults),
    [currentWorker, modelDefaults],
  );

  useEffect(() => {
    if (
      shouldShowModelControls &&
      agentKey &&
      (resolvedDefaultOverride.key ||
        resolvedDefaultOverride.reasoningEffort ||
        resolvedDefaultOverride.serviceTier) &&
      modelOverride.key === resolvedDefaultOverride.key &&
      modelOverride.reasoningEffort === resolvedDefaultOverride.reasoningEffort &&
      modelOverride.serviceTier === resolvedDefaultOverride.serviceTier
    ) {
      appliedDefaultRef.current = {
        agentKey,
        value: resolvedDefaultOverride,
      };
      return;
    }
    if (
      !shouldApplyCoderDefaultModelOverride({
        shouldShowModelControls,
        agentKey,
        modelOverride,
        resolvedDefaultOverride,
        previousAppliedDefault: appliedDefaultRef.current,
      })
    ) {
      return;
    }

    appliedDefaultRef.current = {
      agentKey,
      value: resolvedDefaultOverride,
    };
    onModelOverrideChange(resolvedDefaultOverride);
  }, [
    agentKey,
    modelOverride.key,
    modelOverride.reasoningEffort,
    modelOverride.serviceTier,
    onModelOverrideChange,
    resolvedDefaultOverride,
    shouldShowModelControls,
  ]);

  const selectedModelKey =
    modelOverride.key ||
    resolvedDefaultOverride.key ||
    modelDefaults.defaultModelKey ||
    "";
  const selectedReasoningEffort =
    modelOverride.reasoningEffort || resolvedDefaultOverride.reasoningEffort;
  const selectedServiceTier =
    normalizeServiceTier(
      modelOverride.serviceTier ||
        resolvedDefaultOverride.serviceTier ||
        modelDefaults.defaultServiceTier,
    ) || "STANDARD";
  const selectedModelLabel = selectedModelKey
    ? modelLabelByKey.get(selectedModelKey) || selectedModelKey
    : t("composer.query.model.loading");
  const selectedReasoningLabel = selectedReasoningEffort
    ? t(`composer.query.reasoning.${selectedReasoningEffort}`)
    : t("composer.query.model.loading");
  const showFastBadge = selectedServiceTier === "FAST";

  const persistModelConfig = async (nextOverride: QueryModelOverride) => {
    const nextModelKey = String(nextOverride.key || "").trim();
    if (!agentKey || !nextModelKey) return;
    const nextReasoningEffort = nextOverride.reasoningEffort || "MEDIUM";
    const persistedOverride: QueryModelOverride = {
      key: nextModelKey,
      reasoningEffort: nextReasoningEffort,
      ...(nextOverride.serviceTier
        ? { serviceTier: nextOverride.serviceTier }
        : {}),
    };
    setModelConfigSaving(true);
    setModelConfigError("");
    try {
      const response = await updateAgentModelConfig({
        agentKey: toAgentConfigKey(agentKey),
        modelKey: nextModelKey,
        reasoningEffort: nextReasoningEffort,
        serviceTier: nextOverride.serviceTier,
      });
      const detail = response.data;
      const nextDefaultServiceTier =
        normalizeServiceTier(nextOverride.serviceTier) || "STANDARD";
      setModelDefaults((currentDefaults) => ({
        ...currentDefaults,
        defaultModelKey: nextModelKey,
        defaultReasoningEffort: nextReasoningEffort,
        defaultServiceTier: nextDefaultServiceTier,
      }));
      onModelOverrideChange(persistedOverride);
      appliedDefaultRef.current = {
        agentKey,
        value: persistedOverride,
      };
      const nextAgents = state.agents.map((agent) =>
        toText(agent.key) === toText(detail.key || agentKey)
          ? agentSummaryFromModelConfig(agent, detail, persistedOverride)
          : agent,
      );
      dispatch({ type: "SET_AGENTS", agents: nextAgents });
    } catch (error) {
      setModelConfigError((error as Error).message);
    } finally {
      setModelConfigSaving(false);
    }
  };

  const modelItems = useMemo<MenuProps["items"]>(
    () =>
      buildModelMenuItems({
        models,
        reasoningEfforts,
        serviceTiers,
        modelOverride,
        selectedModelLabel,
        selectedModelKey,
        selectedReasoningEffort,
        selectedServiceTier,
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
      selectedServiceTier,
      serviceTiers,
      t,
    ],
  );

  const onModelMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (modelConfigSaving) return;
    const textKey = String(key);
    if (textKey.startsWith("model:")) {
      const encoded = textKey.slice("model:".length);
      if (!encoded) return;
      const nextModelKey = decodeURIComponent(encoded);
      const nextModel = models.find((model) => toText(model.key) === nextModelKey);
      const currentServiceTier = selectedServiceTier;
      void persistModelConfig({
        ...buildPersistedModelConfigOverride({
          current: modelOverride,
          patch: {
            key: nextModelKey,
            serviceTier:
              serviceTierSupportedByModel(currentServiceTier, nextModel) &&
              currentServiceTier !== "STANDARD"
                ? currentServiceTier
                : undefined,
          },
          defaults: {
            defaultModelKey:
              resolvedDefaultOverride.key || modelDefaults.defaultModelKey,
            defaultReasoningEffort:
              resolvedDefaultOverride.reasoningEffort ||
              modelDefaults.defaultReasoningEffort,
            defaultServiceTier:
              resolvedDefaultOverride.serviceTier ||
              modelDefaults.defaultServiceTier,
          },
        }),
      });
      return;
    }
    if (textKey.startsWith("reasoning:")) {
      const effort = normalizeReasoningEffort(
        textKey.slice("reasoning:".length),
      );
      if (!effort) return;
      void persistModelConfig({
        ...buildPersistedModelConfigOverride({
          current: modelOverride,
          patch: { reasoningEffort: effort },
          defaults: {
            defaultModelKey:
              resolvedDefaultOverride.key || modelDefaults.defaultModelKey,
            defaultReasoningEffort:
              resolvedDefaultOverride.reasoningEffort ||
              modelDefaults.defaultReasoningEffort,
            defaultServiceTier:
              resolvedDefaultOverride.serviceTier ||
              modelDefaults.defaultServiceTier,
          },
        }),
      });
      return;
    }
    if (textKey.startsWith("serviceTier:")) {
      const serviceTier = normalizeServiceTier(
        textKey.slice("serviceTier:".length),
      );
      if (!serviceTier) return;
      void persistModelConfig({
        ...buildPersistedModelConfigOverride({
          current: modelOverride,
          patch: {
            ...(serviceTier === "STANDARD"
              ? { serviceTier: undefined }
              : { serviceTier }),
          },
          defaults: {
            defaultModelKey:
              resolvedDefaultOverride.key || modelDefaults.defaultModelKey,
            defaultReasoningEffort:
              resolvedDefaultOverride.reasoningEffort ||
              modelDefaults.defaultReasoningEffort,
            defaultServiceTier:
              resolvedDefaultOverride.serviceTier ||
              modelDefaults.defaultServiceTier,
          },
        }),
      });
    }
  };

  const onModelMenuOpenChange = (open: boolean) => {
    if (
      !shouldRetryModelOptionsOnOpen({
        open,
        isCoderAgent: shouldShowModelControls,
        agentKey,
        modelsLoading,
        status: modelOptionsStatus,
        models,
        reasoningEfforts,
      })
    ) {
      return;
    }
    setModelOptionsStatus("idle");
    setLoadAttempt((attempt) => attempt + 1);
  };

  return (
    <div className="query-settings-controls">
      <Dropdown
        menu={{
          className: "query-settings-menu",
          items: accessItems,
          onClick: ({ key }) => onAccessLevelChange(key as QueryAccessLevel),
          selectedKeys: [accessLevel],
        }}
        placement="topRight"
        trigger={["click"]}
      >
        <UiButton
          className="query-settings-btn"
          variant="ghost"
          size="sm"
          color="var(--accent)"
          title={t("composer.query.access.title")}
          onClick={(event) => event.preventDefault()}
          style={{ color: ACCESS_LEVEL_COLOR[accessLevel] }}
        >
          <MaterialIcon name={ACCESS_LEVEL_ICON[accessLevel]} />
          <span>{accessLabel}</span>
          <MaterialIcon name="expand_more" />
        </UiButton>
      </Dropdown>
      {shouldShowModelControls ? (
        <Dropdown
          menu={{
            className: "query-settings-menu",
            items: modelItems,
            onClick: onModelMenuClick,
          }}
          onOpenChange={onModelMenuOpenChange}
          placement="topRight"
          trigger={["click"]}
        >
          <UiButton
            className={`query-settings-btn query-model-btn ${modelsLoading ? "is-loading" : ""}`.trim()}
            variant="ghost"
            size="sm"
            disabled={disabled || modelConfigSaving}
            title={modelConfigError || t("composer.query.model.title")}
            onClick={(event) => event.preventDefault()}
          >
            {showFastBadge ? <MaterialIcon name="bolt" /> : null}
            <span className="query-model-label">
              {selectedModelLabel}
            </span>
            <span>
              {modelConfigSaving
                ? t("composer.query.model.saving")
                : selectedReasoningLabel}
            </span>
            <MaterialIcon name="expand_more" />
          </UiButton>
        </Dropdown>
      ) : null}
      {shouldShowModelControls && modelConfigError ? (
        <span className="query-model-error">{modelConfigError}</span>
      ) : null}
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/features/agents/lib/agentState";
import {
  resolveCurrentWorkerSummary,
  type CurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
import {
  getModelOptions,
  updateAgentModelConfig,
} from "@/shared/data";
import { normalizeQueryReasoningEffort as normalizeReasoningEffort } from "@/shared/data/api/reasoningEffort";
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
import { buildModelMenuItems } from "@/features/model-config/components/ModelMenuPresenter";
import {
  filterModelOptions,
  filterReasoningOptions,
  filterServiceTierOptions,
  getModelDisplayName,
  normalizeModelServiceTier,
  normalizeOptionalModelServiceTier,
  serviceTierSupportedByModel,
} from "@/features/model-config/lib/modelOptions";

interface QuerySettingsControlsProps {
  accessLevel: QueryAccessLevel;
  compact?: boolean;
  disabled?: boolean;
  modelOverride: QueryModelOverride;
  onAccessLevelChange: (value: QueryAccessLevel) => void;
  onModelOverrideChange: (value: QueryModelOverride) => void;
  showModelSelector?: boolean;
  interactionConfig?: import("@/shared/contracts/interaction").InteractionConfig;
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
const ACCESS_LEVEL_BUTTON_CLASS: Record<QueryAccessLevel, string> = {
  default: "",
  auto_approve:
    "tw:!text-[color-mix(in_srgb,var(--accent-warn)_72%,transparent)]",
  full_access:
    "tw:!text-[color-mix(in_srgb,var(--accent-danger)_72%,transparent)]",
};
const ACCESS_LEVEL_MENU_ITEM_CLASS: Record<QueryAccessLevel, string> = {
  default: "query-settings-access-item query-settings-access-item-default tw:text-text-main",
  auto_approve:
    "query-settings-access-item query-settings-access-item-auto_approve tw:text-[color-mix(in_srgb,var(--accent-warn)_72%,transparent)]",
  full_access:
    "query-settings-access-item query-settings-access-item-full_access tw:text-[color-mix(in_srgb,var(--accent-danger)_72%,transparent)]",
};
const ACCESS_LEVEL_MENU_OPTION_CLASS =
  "query-settings-access-menu-option ui-icon-hover-24";
const QUERY_SETTINGS_CONTROLS_CLASS =
  "query-settings-controls tw:inline-flex tw:items-center";
const QUERY_SETTINGS_BUTTON_CLASS =
  "query-settings-btn tw:!min-h-8 tw:!rounded-lg tw:!px-2 tw:!text-[13px] tw:text-text-muted tw:[&_.material-icon]:flex-none tw:[&_.material-icon]:text-sm tw:[&_.ui-btn-label]:inline-flex tw:[&_.ui-btn-label]:min-w-0 tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-1 tw:[&_.ui-btn-label>span:not(.material-icon)]:min-w-0 tw:[&_.ui-btn-label>span:not(.material-icon)]:overflow-hidden tw:[&_.ui-btn-label>span:not(.material-icon)]:text-ellipsis tw:[&_.ui-btn-label>span:not(.material-icon)]:whitespace-nowrap";
const QUERY_MODEL_BUTTON_CLASS = "query-model-btn tw:overflow-hidden";
const QUERY_MODEL_BUTTON_STATE_CLASS = {
  idle: "",
  loading: "is-loading tw:pointer-events-auto",
} as const;
const QUERY_MODEL_LABEL_CLASS = "query-model-label tw:text-text-main";
const QUERY_MODEL_ERROR_CLASS =
  "query-model-error tw:max-w-[220px] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:text-danger";
const QUERY_SETTINGS_MENU_ITEM_CLASS =
  "query-settings-menu-item tw:inline-flex tw:items-center tw:justify-between tw:gap-1.5 tw:text-[13px] tw:[&_.material-icon]:text-sm";

type ModelOptionsStatus = "idle" | "loaded" | "empty" | "failed";

type LoadedCoderModelOptions = {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers: ServiceTierOption[];
};

type AgentModelDefaults = {
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

export type ModelOptionsSource = "embedded" | "cache" | "fetch";

export function resolveModelOptionsSource({
  forceRefresh,
  manualRefreshActive,
  hasEmbeddedOptions,
  hasCachedOptions,
}: {
  forceRefresh: boolean;
  manualRefreshActive: boolean;
  hasEmbeddedOptions: boolean;
  hasCachedOptions: boolean;
}): ModelOptionsSource {
  if (forceRefresh) return "fetch";
  if (!manualRefreshActive && hasEmbeddedOptions) return "embedded";
  if (hasCachedOptions) return "cache";
  return "fetch";
}

export function normalizeCoderModelOptionsResponse(response: unknown): {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers: ServiceTierOption[];
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
}): LoadedCoderModelOptions {
  return {
    models: options.models,
    reasoningEfforts: options.reasoningEfforts,
    serviceTiers: options.serviceTiers,
  };
}

export function resolveEmbeddedCoderModelOptions(
  rawAgent: unknown,
): LoadedCoderModelOptions | null {
  const raw = getRecord(rawAgent);
  if (!isRecord(raw.modelOptions)) {
    return null;
  }
  const options = normalizeCoderModelOptionsResponse(raw.modelOptions);
  if (!options.recognized) {
    console.warn(
      "[QuerySettingsControls] Unrecognized embedded model options response",
      raw.modelOptions,
    );
    return null;
  }
  return toLoadedCoderModelOptions(options);
}

export function resolveCoderAgentDefaultModelOverride(
  currentWorker: Pick<CurrentWorkerSummary, "raw"> | null | undefined,
): QueryModelOverride {
  const raw = getRecord(currentWorker?.raw);
  const key = getModelKey(raw.modelKey);
  const reasoningEffort = normalizeReasoningEffort(raw.reasoningEffort);
  const serviceTier = normalizeOptionalModelServiceTier(raw.serviceTier);
  return {
    ...(key ? {key} : {}),
    ...(reasoningEffort ? {reasoningEffort} : {}),
    ...(serviceTier && serviceTier !== "STANDARD" ? {serviceTier} : {}),
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
  options: { force?: boolean } = {},
): Promise<LoadedCoderModelOptions> {
  const cacheKey = modelOptionsCacheKey(agentKey);
  const force = options.force === true;
  if (!force) {
    const cachedOptions = cachedCoderModelOptions.get(cacheKey);
    if (cachedOptions) {
      return cachedOptions;
    }
  }
  const pendingOptions = pendingCoderModelOptionsPromises.get(cacheKey);
  if (pendingOptions) {
    return pendingOptions;
  }

  const requestAgentKey = toAgentConfigKey(agentKey) || undefined;
  const nextPromise = getModelOptions(requestAgentKey, { force })
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
  defaults: AgentModelDefaults;
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
  const key = response.agentKey || existing?.key || "";
  return {
    ...(existing || {}),
    key,
    name: existing?.name || key,
    modelKey: response.modelKey,
    reasoningEffort: response.reasoningEffort,
    serviceTier: response.serviceTier,
  };
}

export const QuerySettingsControls: React.FC<QuerySettingsControlsProps> = ({
  accessLevel,
  compact = false,
  disabled = false,
  modelOverride,
  onAccessLevelChange,
  onModelOverrideChange,
  showModelSelector = true,
  interactionConfig,
}) => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const isCoderAgent =
    currentWorker?.type === "agent" &&
    (isCoderMode(currentWorker.raw?.mode) ||
      currentWorker.row?.agentType === "coder");
  const modelAllowed = interactionConfig?.model ?? isCoderAgent;
  const shouldShowModelControls = showModelSelector && modelAllowed;
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
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptionsStatus, setModelOptionsStatus] =
    useState<ModelOptionsStatus>("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [modelConfigSaving, setModelConfigSaving] = useState(false);
  const [modelConfigError, setModelConfigError] = useState("");
  const [modelRefreshFailed, setModelRefreshFailed] = useState(false);
  const appliedDefaultRef = useRef<AppliedDefaultModelOverride | null>(null);
  const forceRefreshRef = useRef(false);
  const manualRefreshAgentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!showModelSelector) {
      return;
    }
    if (!shouldClearModelOverride(modelAllowed, modelOverride)) {
      return;
    }
    appliedDefaultRef.current = null;
    onModelOverrideChange({});
  }, [modelAllowed, modelOverride, onModelOverrideChange, showModelSelector]);

  useEffect(() => {
    if (!shouldShowModelControls || !agentKey) {
      forceRefreshRef.current = false;
      manualRefreshAgentKeyRef.current = null;
      setModels([]);
      setReasoningEfforts([]);
      setServiceTiers(filterServiceTierOptions([]));
      setModelsLoading(false);
      setModelOptionsStatus("idle");
      setModelRefreshFailed(false);
      return;
    }
    const forceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    const manualRefreshActive = manualRefreshAgentKeyRef.current === agentKey;
    const cachedOptions = getCachedCoderModelOptions(agentKey);
    const source = resolveModelOptionsSource({
      forceRefresh,
      manualRefreshActive,
      hasEmbeddedOptions: Boolean(embeddedModelOptions),
      hasCachedOptions: Boolean(cachedOptions),
    });
    if (source === "embedded" && embeddedModelOptions) {
      setModels(embeddedModelOptions.models);
      setReasoningEfforts(embeddedModelOptions.reasoningEfforts);
      setServiceTiers(embeddedModelOptions.serviceTiers);
      setModelsLoading(false);
      setModelOptionsStatus(
        embeddedModelOptions.models.length > 0 ||
          embeddedModelOptions.reasoningEfforts.length > 0
          ? "loaded"
          : "empty",
      );
      return;
    }
    if (source === "cache" && cachedOptions) {
      setModels(cachedOptions.models);
      setReasoningEfforts(cachedOptions.reasoningEfforts);
      setServiceTiers(cachedOptions.serviceTiers);
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
    if (!forceRefresh) {
      setModelOptionsStatus("idle");
    }
    void loadCoderModelOptions(agentKey, { force: forceRefresh })
      .then((options) => {
        if (cancelled) return;
        setModels(options.models);
        setReasoningEfforts(options.reasoningEfforts);
        setServiceTiers(options.serviceTiers);
        setModelOptionsStatus(
          options.models.length > 0 || options.reasoningEfforts.length > 0
            ? "loaded"
            : "empty",
        );
        if (forceRefresh) {
          manualRefreshAgentKeyRef.current = agentKey;
        }
        setModelRefreshFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (forceRefresh) {
          setModelRefreshFailed(true);
          return;
        }
        setModels([]);
        setReasoningEfforts([]);
        setServiceTiers(filterServiceTierOptions([]));
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
        className: ACCESS_LEVEL_MENU_OPTION_CLASS,
        label: (
          <span
            className={ACCESS_LEVEL_MENU_ITEM_CLASS[value]}
          >
            <span className={QUERY_SETTINGS_MENU_ITEM_CLASS}>
              <MaterialIcon
                name={ACCESS_LEVEL_ICON[value]}
                className="ui-icon-hover-24-target"
              />
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
    () => resolveCoderAgentDefaultModelOverride(currentWorker),
    [currentWorker],
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

  const modelKey =
    modelOverride.key ||
    resolvedDefaultOverride.key ||
    "";
  const reasoningEffort =
    modelOverride.reasoningEffort || resolvedDefaultOverride.reasoningEffort;
  const serviceTier =
    normalizeModelServiceTier(
      modelOverride.serviceTier ||
        resolvedDefaultOverride.serviceTier,
    ) || "STANDARD";
  const loadingModelOptions = modelsLoading || modelOptionsStatus === "idle";
  const selectedModelLabel = modelKey
    ? modelLabelByKey.get(modelKey) || modelKey
    : t(loadingModelOptions ? "composer.query.model.loading"
      : modelOptionsStatus === "failed" ? "composer.query.model.loadFailed"
      : "composer.query.model.empty");
  const selectedReasoningLabel = reasoningEffort
    ? t(`composer.query.reasoning.${reasoningEffort}`)
    : t(loadingModelOptions ? "composer.query.model.loading" : "composer.query.reasoning.default");
  const showFastBadge = serviceTier === "FAST";
  const queryModelButtonStateClass = modelsLoading
    ? QUERY_MODEL_BUTTON_STATE_CLASS.loading
    : QUERY_MODEL_BUTTON_STATE_CLASS.idle;
  const modelUnavailable = Boolean(modelKey) &&
    (modelOptionsStatus === "loaded" || modelOptionsStatus === "empty") &&
    !models.some(model => model.key === modelKey);
  const modelErrorText =
    modelConfigError ||
    (modelRefreshFailed ? t("composer.query.model.refreshFailed") : "") ||
    (modelUnavailable ? t("composer.query.model.unavailable") : "");

  const handleRefreshModels = useCallback(() => {
    if (!agentKey || modelsLoading || disabled) return;
    setModelRefreshFailed(false);
    forceRefreshRef.current = true;
    setLoadAttempt((attempt) => attempt + 1);
  }, [agentKey, disabled, modelsLoading]);

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
        serviceTier: nextOverride.serviceTier || null,
      });
      const detail = response.data;
      onModelOverrideChange(persistedOverride);
      appliedDefaultRef.current = {
        agentKey,
        value: persistedOverride,
      };
      const nextAgents = state.agents.map((agent) =>
        toText(agent.key) === toText(detail.agentKey || agentKey)
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
        selectedModelKey: modelKey,
        selectedReasoningEffort: reasoningEffort,
        selectedServiceTier: serviceTier,
        modelsLoading,
        status: modelOptionsStatus,
        modelListAction:
          shouldShowModelControls && agentKey
            ? {
                label: t("composer.query.model.refresh"),
                busy: modelsLoading,
                disabled: modelConfigSaving,
                onTrigger: handleRefreshModels,
              }
            : undefined,
        t,
      }),
    [
      agentKey,
      handleRefreshModels,
      modelConfigSaving,
      modelOverride,
      modelOptionsStatus,
      models,
      modelsLoading,
      reasoningEfforts,
      modelKey,
      selectedModelLabel,
      reasoningEffort,
      serviceTier,
      serviceTiers,
      shouldShowModelControls,
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
      const currentServiceTier = serviceTier;
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
              resolvedDefaultOverride.key,
            defaultReasoningEffort:
              resolvedDefaultOverride.reasoningEffort,
            defaultServiceTier:
              resolvedDefaultOverride.serviceTier,
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
              resolvedDefaultOverride.key,
            defaultReasoningEffort:
              resolvedDefaultOverride.reasoningEffort,
            defaultServiceTier:
              resolvedDefaultOverride.serviceTier,
          },
        }),
      });
      return;
    }
    if (textKey.startsWith("serviceTier:")) {
      const serviceTier = normalizeModelServiceTier(
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
              resolvedDefaultOverride.key,
            defaultReasoningEffort:
              resolvedDefaultOverride.reasoningEffort,
            defaultServiceTier:
              resolvedDefaultOverride.serviceTier,
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
    <div className={QUERY_SETTINGS_CONTROLS_CLASS}>
      {(interactionConfig?.accessLevel ?? true) && <Dropdown
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
          className={`${QUERY_SETTINGS_BUTTON_CLASS} ui-icon-hover-24 ${ACCESS_LEVEL_BUTTON_CLASS[accessLevel]}`.trim()}
          variant="ghost"
          size="sm"
          color="var(--accent)"
          title={t("composer.query.access.title")}
          onClick={(event) => event.preventDefault()}
        >
          <MaterialIcon
            name={ACCESS_LEVEL_ICON[accessLevel]}
            className="ui-icon-hover-24-target"
          />
          {!compact && <span>{accessLabel}</span>}
          <MaterialIcon name="expand_more" />
        </UiButton>
      </Dropdown>}
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
            className={`${QUERY_SETTINGS_BUTTON_CLASS} ${QUERY_MODEL_BUTTON_CLASS} ${queryModelButtonStateClass}`.trim()}
            variant="ghost"
            size="sm"
            disabled={disabled || modelConfigSaving}
            title={modelErrorText || t("composer.query.model.title")}
            onClick={(event) => event.preventDefault()}
          >
            {showFastBadge ? <MaterialIcon name="bolt" /> : null}
            <span className={QUERY_MODEL_LABEL_CLASS}>
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
      {shouldShowModelControls && modelErrorText ? (
        <span className={QUERY_MODEL_ERROR_CLASS}>{modelErrorText}</span>
      ) : null}
    </div>
  );
};

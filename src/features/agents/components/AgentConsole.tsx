import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./AgentConsole.module.css";
import {
  Dropdown,
  Input,
  Modal,
  Popover,
  Popconfirm,
  Select,
  Spin,
  Tabs,
  Tooltip,
  message,
  type MenuProps,
} from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/features/agents/lib/agentState";
import {
  createAgent,
  deleteAgent,
  deleteAdminAgentPrivateSkill,
  getAdminAgentDetail,
  getAdminAgentEditorOptions,
  getAdminAgents,
  getAdminSource,
  getAdminSkills,
  getAdminTools,
  getAgents,
  importAdminAgent,
  importAdminAgentPrivateSkill,
  putAdminAgentOrder,
  updateAgent,
  updateAdminSource,
} from "@/shared/data";
import {
  ACTIVE_QUERY_REASONING_EFFORTS,
  normalizeQueryReasoningEffort,
} from "@/shared/data/api/reasoningEffort";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import type {
  AdminAgentDetailResponse,
  AdminAgentDiagnostic,
  AdminAgentPrivateSkill,
  AdminToolSummary,
  AgentDetailResponse,
  AgentEditorModelOption,
  AgentEditorOptionsResponse,
  AdminSourceResponse,
  CoderModelOption,
  QueryReasoningEffort,
  ServiceTierOption,
} from "@/shared/data";
import {
  agentOrderPayload,
  filterAgentsPreservingOrder,
  moveAgentForDrop,
} from "@/features/agents/lib/agentOrdering";
import { AGENT_ICON_NAMES, AgentIcon } from "@/shared/icons/agent";
import { buildModelMenuItems } from "@/features/model-config/components/ModelMenuPresenter";
import { AgentCreateModal } from "@/features/agents/components/AgentCreateModal";
import { AgentCapabilitiesEditor } from "@/features/agents/components/AgentCapabilitiesEditor";
import { AgentEditor } from "@/features/agents/components/AgentEditor";
import { AgentListPane } from "@/features/agents/components/AgentListPane";
import { AgentSourceEditor } from "@/features/agents/components/AgentSourceEditor";
import { useAgentConsoleRuntime } from "@/features/agents/hooks/useAgentConsoleRuntime";
import {
  agentImportSuccessMessageKey,
  confirmAgentDraftDiscard,
  formatAgentArchiveSize,
} from "@/features/agents/lib/agentImport";
import type {
  AgentSkillOption,
  AgentToolOption,
} from "@/features/agents/lib/agentOptions";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n, type I18nContextValue } from "@/shared/i18n";

type AgentFormMode = "create" | "edit";
type AgentEditorMode = "structured" | "source";
type AgentInteractionMode = "view" | "edit";
type IconKind = "none" | "builtin" | "image";
type AgentToolFilter = "all" | "file" | "desktop" | "system";
type Translate = I18nContextValue["t"];

export function initialAgentInteractionMode(
  formMode: AgentFormMode,
): AgentInteractionMode {
  return formMode === "edit" ? "view" : "edit";
}

export function shouldReloadAgentDetail(
  loadedAgentKey: string,
  selectedAgentKey: string,
): boolean {
  const nextKey = selectedAgentKey.trim();
  return Boolean(nextKey) && loadedAgentKey !== nextKey;
}

export function getActiveAgentSectionId<T extends string>(
  sections: ReadonlyArray<{ id: T; top: number }>,
  anchorTop: number,
  options: { atScrollEnd?: boolean } = {},
): T | null {
  if (!sections.length) return null;
  const visualSections = [...sections].sort(
    (left, right) => left.top - right.top,
  );
  if (options.atScrollEnd) {
    return visualSections[visualSections.length - 1].id;
  }
  return (
    visualSections
      .slice()
      .reverse()
      .find((section) => section.top <= anchorTop)?.id ?? visualSections[0].id
  );
}
type EditableAgentDetail = AgentDetailResponse | AdminAgentDetailResponse;

type ChoicePresentation = {
  icon: MaterialIconName;
  label: string;
  description: string;
};
interface AgentFormState {
  key: string;
  name: string;
  iconKind: IconKind;
  iconName: string;
  iconImage: string;
  role: string;
  description: string;
  mode: string;
  modelKey: string;
  serviceTier: string;
  reasoningConfigured: boolean;
  reasoningEnabled: boolean;
  reasoningEffort: string;
  tools: string[];
  skills: string[];
  greetingsText: string;
  wondersText: string;
  contextTags: string[];
  visibilityScopes: string[];
  budgetText: string;
  controlsText: string;
  runtimeConfigText: string;
  memoryConfigText: string;
  proxyConfigText: string;
  soulPrompt: string;
  agentsPrompt: string;
}

export interface AgentConsoleProps {
  selectedAgentKey?: string;
  onSelectAgentKey?: (agentKey: string) => void;
  onClearSelection?: () => void;
  onClose?: () => void;
  titleBarVariant?: "default" | "drawer";
  onDirtyChange?: (dirty: boolean) => void;
  embedded?: boolean;
}

export const AGENT_CONSOLE_ADMIN_LIST_ROUTE = dataEndpoints.adminAgents.path;

export function shouldShowAgentSectionNav(
  editorMode: AgentEditorMode,
  canEditStructuredAgent: boolean,
): boolean {
  return editorMode === "structured" && canEditStructuredAgent;
}

export async function saveAgentOrderRequest(agents: Agent[]): Promise<void> {
  await putAdminAgentOrder({ order: agentOrderPayload(agents) });
}

const EMPTY_FORM: AgentFormState = {
  key: "",
  name: "",
  iconKind: "none",
  iconName: "",
  iconImage: "",
  role: "",
  description: "",
  mode: "REACT",
  modelKey: "",
  serviceTier: "STANDARD",
  reasoningConfigured: false,
  reasoningEnabled: false,
  reasoningEffort: "",
  tools: [],
  skills: [],
  greetingsText: "[]",
  wondersText: "[]",
  contextTags: [],
  visibilityScopes: ["nav"],
  budgetText: "",
  controlsText: "[]",
  runtimeConfigText: "",
  memoryConfigText: "",
  proxyConfigText: "",
  soulPrompt: "",
  agentsPrompt: "",
};

function createEmptyAgentForm(): AgentFormState {
  const suffix = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return { ...EMPTY_FORM, key: `agent-${suffix}` };
}

const BUDGET_PLACEHOLDER = `{
  "runTimeoutMs": 600000,
  "maxSteps": 240,
  "model": { "maxCalls": 240 },
  "tool": { "maxCalls": 200 }
}`;
const SIMPLE_BUDGET_TEMPLATE = `{
  "runTimeoutMs": 600000,
  "maxSteps": 120
}`;
const DEFAULT_REASONING_EFFORTS = [...ACTIVE_QUERY_REASONING_EFFORTS];

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeReasoningEffort(value: unknown): string {
  return normalizeQueryReasoningEffort(value) || "";
}

function normalizeServiceTier(value: unknown): string {
  const tier = toText(value).toUpperCase();
  if (!tier || tier === "DEFAULT" || tier === "AUTO") return "STANDARD";
  return tier === "PRIORITY" ? "FAST" : tier;
}

export function getModelReasoningEfforts(
  models: AgentEditorModelOption[] | undefined,
  modelKey: string,
): string[] {
  if (!toText(modelKey)) return [];
  const selectedModel = (models || []).find(
    (model) => toText(model.key) === toText(modelKey),
  );
  if (!selectedModel || !Array.isArray(selectedModel.reasoningEfforts)) {
    return [...DEFAULT_REASONING_EFFORTS];
  }
  const seen = new Set<string>();
  return selectedModel.reasoningEfforts.reduce<string[]>((efforts, value) => {
    const effort = normalizeReasoningEffort(value);
    if (!effort || effort === "NONE" || seen.has(effort)) return efforts;
    seen.add(effort);
    efforts.push(effort);
    return efforts;
  }, []);
}

export function defaultReasoningEffort(efforts: string[]): string {
  return efforts.includes("MEDIUM") ? "MEDIUM" : efforts[0] || "";
}

function reasoningEffortLabel(effort: string, t: Translate): string {
  const normalized = normalizeReasoningEffort(effort);
  switch (normalized) {
    case "LOW":
    case "MEDIUM":
    case "HIGH":
    case "XHIGH":
    case "MAX":
      return t(`composer.query.reasoning.${normalized}`);
    default:
      return effort;
  }
}

function readAdminToolKind(tool: Partial<AdminToolSummary>): string {
  return toText(tool.kind);
}

function readAdminToolSourceCategory(tool: Partial<AdminToolSummary>): string {
  return toText(tool.sourceCategory);
}

function toolSourceLabel(sourceCategory: string, t: Translate): string {
  switch (sourceCategory.toLowerCase()) {
    case "platform":
      return t("toolSource.platform");
    case "external":
      return t("toolSource.external");
    case "mcp":
      return t("toolSource.mcp");
    default:
      return sourceCategory;
  }
}

export function toolOptionLabel(option: AgentToolOption, t: Translate): string {
  const sourceLabel = toolSourceLabel(option.sourceCategory, t);
  return [
    option.label,
    option.label === option.key ? "" : option.key,
    sourceLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

function toolFilterForOption(option: AgentToolOption): Exclude<
  AgentToolFilter,
  "all"
> {
  const haystack = `${option.key} ${option.label} ${option.kind}`.toLowerCase();
  if (/file|path|glob|grep/.test(haystack)) return "file";
  if (/desktop|screen|window|clipboard/.test(haystack)) return "desktop";
  return "system";
}

function contextOptionPresentation(key: string): {
  icon: MaterialIconName;
  descriptionKey: string;
} {
  switch (key.toLowerCase()) {
    case "system":
      return { icon: "article", descriptionKey: "agentConsole.context.systemHint" };
    case "session":
      return { icon: "history", descriptionKey: "agentConsole.context.sessionHint" };
    case "owner":
      return { icon: "person", descriptionKey: "agentConsole.context.ownerHint" };
    default:
      return { icon: "description", descriptionKey: "agentConsole.context.defaultHint" };
  }
}

export function readAdminAgentStatus(value: unknown): string {
  return toText(asRecord(value).status).toLowerCase();
}

export function isInvalidAdminAgent(value: unknown): boolean {
  return readAdminAgentStatus(value) === "invalid";
}

export function readAdminAgentDiagnostics(
  value: unknown,
): AdminAgentDiagnostic[] {
  const diagnostics = asRecord(value).diagnostics;
  if (!Array.isArray(diagnostics)) return [];
  return diagnostics
    .map((item) => {
      const record = asRecord(item);
      const message = toText(record.message);
      const code = toText(record.code);
      if (!message && !code) return null;
      const sourcePath = toText(record.sourcePath);
      return {
        severity: toText(record.severity) || "error",
        code,
        message: message || code,
        ...(sourcePath ? { sourcePath } : {}),
      };
    })
    .filter((item): item is AdminAgentDiagnostic => Boolean(item));
}

export function firstAdminAgentDiagnosticMessage(value: unknown): string {
  return readAdminAgentDiagnostics(value)[0]?.message || "";
}

export function hasEditableAdminDefinition(
  detail: EditableAgentDetail | null,
): boolean {
  if (!detail || !isInvalidAdminAgent(detail)) return true;
  return Boolean(detail.definition);
}

export function resolveAdminAgentSourcePath(detail: unknown): string {
  const record = asRecord(detail);
  const source = asRecord(record.source);
  return (
    toText(source.path) ||
    toText(source.agentDir) ||
    readAdminAgentDiagnostics(detail)
      .map((item) => toText(item.sourcePath))
      .find(Boolean) ||
    ""
  );
}

export function privateSkillsFromDetail(
  detail: EditableAgentDetail | null,
): AdminAgentPrivateSkill[] {
  if (
    !detail ||
    !Array.isArray((detail as AdminAgentDetailResponse).privateSkills)
  ) {
    return [];
  }
  return (detail as AdminAgentDetailResponse).privateSkills || [];
}

function agentSkillDisplayName(label: string, key: string): string {
  const value = toText(label) || toText(key);
  if (
    value === value.toLowerCase() &&
    value.toLowerCase() === toText(key).toLowerCase() &&
    /^[a-z0-9]{2,4}$/.test(value)
  ) {
    return value.toUpperCase();
  }
  return value;
}

export function mergeAgentSkillOptions(
  centerSkills: Array<{ key: string; label: string; description?: string }>,
  privateSkills: AdminAgentPrivateSkill[],
  selectedSkills: string[],
  t: Translate,
): AgentSkillOption[] {
  const entries = new Map<string, AgentSkillOption>();
  for (const item of centerSkills) {
    const key = toText(item.key);
    if (!key) continue;
    entries.set(key.toLowerCase(), {
      key,
      label: item.label || key,
      description: item.description,
      source: "center",
    });
  }
  for (const item of privateSkills) {
    const key = toText(item.key);
    if (!key) continue;
    const centerExists = entries.has(key.toLowerCase());
    entries.set(key.toLowerCase(), {
      key,
      label: toText(item.name) || key,
      description: toText(item.description) || undefined,
      source: "private",
      overridesCenter: item.overridesCenter || centerExists,
    });
  }
  for (const rawKey of selectedSkills) {
    const key = toText(rawKey);
    if (!key || entries.has(key.toLowerCase())) continue;
    entries.set(key.toLowerCase(), { key, label: key, source: "center" });
  }
  return [...entries.values()]
    .map((item) => ({
      ...item,
      label:
        item.source === "private"
          ? `${agentSkillDisplayName(item.label, item.key)} · ${t(
              "agentConsole.privateSkill.source.private",
            )}`
          : `${item.label}${item.label === item.key ? "" : ` · ${item.key}`} · ${t(
              "agentConsole.privateSkill.source.center",
            )}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function textListFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];
}

function promptEntriesFromJson(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => toText(item));
  } catch {
    // Keep legacy or temporarily invalid content editable as one entry.
  }
  return [value];
}

function promptEntriesToJson(entries: string[]): string {
  return JSON.stringify(entries, null, 2);
}

function stringifyJson(value: unknown, fallback = ""): string {
  if (value === undefined || value === null || value === "") return fallback;
  return JSON.stringify(value, null, 2);
}

function parseJsonField(
  label: string,
  value: string,
  t: Translate,
  options: { allowEmpty?: boolean; expectArray?: boolean } = {},
): unknown {
  const raw = value.trim();
  if (!raw && options.allowEmpty !== false) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (options.expectArray && !Array.isArray(parsed)) {
      throw new Error(t("agentConsole.error.jsonArray", { label }));
    }
    if (
      !options.expectArray &&
      (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    ) {
      throw new Error(t("agentConsole.error.jsonObject", { label }));
    }
    return parsed;
  } catch (error) {
    const message = (error as Error).message;
    throw new Error(
      message.startsWith(label)
        ? message
        : t("agentConsole.error.jsonInvalid", { label, detail: message }),
    );
  }
}

function normalizeModeForForm(value: unknown): string {
  switch (toText(value).toUpperCase()) {
    case "PROXY":
    case "ACP-PROXY":
    case "ACP_PROXY":
      return "PROXY";
    case "PLAN-EXECUTE":
    case "PLAN_EXECUTE":
      return "PLAN_EXECUTE";
    case "ONESHOT":
    case "":
      return "REACT";
    default:
      return toText(value).toUpperCase();
  }
}

function modePresentation(
  mode: string,
  fallbackLabel: string,
  t: Translate,
): ChoicePresentation {
  switch (normalizeModeForForm(mode)) {
    case "REACT":
      return { icon: "refresh", label: t("agentConsole.mode.react.label"), description: t("agentConsole.mode.react.description") };
    case "CODER":
      return { icon: "code", label: t("agentConsole.mode.coder.label"), description: t("agentConsole.mode.coder.description") };
    case "KBASE":
      return { icon: "book_2", label: t("agentConsole.mode.kbase.label"), description: t("agentConsole.mode.kbase.description") };
    default:
      return { icon: "settings", label: fallbackLabel || mode, description: t("agentConsole.mode.custom.description") };
  }
}

function visibilityPresentation(
  scope: string,
  fallbackLabel: string,
  t: Translate,
): ChoicePresentation {
  switch (scope.trim().toLowerCase()) {
    case "nav":
      return { icon: "dashboard", label: t("agentConsole.visibility.nav.label"), description: t("agentConsole.visibility.nav.description") };
    case "copilot":
      return { icon: "smart_toy", label: t("agentConsole.visibility.copilot.label"), description: t("agentConsole.visibility.copilot.description") };
    case "invoke":
      return { icon: "call", label: t("agentConsole.visibility.invoke.label"), description: t("agentConsole.visibility.invoke.description") };
    case "internal":
      return { icon: "lock", label: t("agentConsole.visibility.internal.label"), description: t("agentConsole.visibility.internal.description") };
    default:
      return { icon: "visibility", label: fallbackLabel || scope, description: t("agentConsole.visibility.custom.description") };
  }
}

function iconFieldsFromValue(
  value: unknown,
): Pick<AgentFormState, "iconKind" | "iconName" | "iconImage"> {
  if (typeof value === "string" && value.trim()) {
    return { iconKind: "image", iconName: "", iconImage: value.trim() };
  }
  const record = asRecord(value);
  const name = toText(record.name);
  if (name) return { iconKind: "builtin", iconName: name, iconImage: "" };
  return { iconKind: "none", iconName: "", iconImage: "" };
}

function buildIconValue(form: AgentFormState): unknown {
  if (form.iconKind === "image") return form.iconImage.trim() || undefined;
  if (form.iconKind === "builtin")
    return form.iconName.trim() ? { name: form.iconName.trim() } : undefined;
  return undefined;
}

function optionLabel(item: Record<string, unknown>): string {
  return toText(item.label) || toText(item.name) || toText(item.key);
}

export function buildAdminToolOption(item: unknown): AgentToolOption | null {
  const record = asRecord(item);
  const tool = record as Partial<AdminToolSummary>;
  const key = toText(record.key) || toText(record.name);
  if (!key) return null;
  return {
    key,
    label: optionLabel(record) || key,
    sourceCategory: readAdminToolSourceCategory(tool),
    kind: readAdminToolKind(tool),
  };
}

function countListItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function readCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}

function resolveFirstCount(...values: unknown[]): number {
  for (const value of values) {
    const count = readCount(value);
    if (count !== undefined) return count;
    if (Array.isArray(value)) return countListItems(value);
  }
  return 0;
}

export function buildAgentListSummary(
  agent: Agent,
  formFallback?: AgentFormState,
) {
  const meta = asRecord(agent.meta);
  const modelConfig = asRecord(agent.modelConfig);
  const toolConfig = asRecord(agent.toolConfig);
  const skillConfig = asRecord(agent.skillConfig);
  return {
    mode: formFallback?.mode || toText(meta.mode) || toText(agent.mode) || "--",
    modelKey:
      toText(meta.modelKey) ||
      toText(agent.modelKey) ||
      toText(modelConfig.modelKey) ||
      toText(agent.model) ||
      formFallback?.modelKey ||
      "--",
    toolsCount: resolveFirstCount(
      meta.toolsCount,
      toolConfig.tools,
      agent.tools,
      formFallback?.tools,
    ),
    skillsCount: resolveFirstCount(
      meta.skillsCount,
      skillConfig.skills,
      agent.skills,
      formFallback?.skills,
    ),
  };
}

export function shouldStartAgentConsoleBootstrap(
  ref: React.MutableRefObject<boolean>,
): boolean {
  if (ref.current) return false;
  ref.current = true;
  return true;
}

function resolveModelKey(
  detail: EditableAgentDetail,
  definition: Record<string, unknown>,
): string {
  const modelConfig = asRecord(definition.modelConfig);
  const meta = asRecord(detail.meta);
  return (
    toText(modelConfig.modelKey) ||
    toText(meta.modelKey) ||
    toText(detail.model)
  );
}

function fallbackDefinition(
  detail: EditableAgentDetail,
): Record<string, unknown> {
  const definition: Record<string, unknown> = {
    key: detail.key,
    name: detail.name,
    icon: detail.icon,
    role: detail.role || "",
    description: detail.description || "",
    mode: normalizeModeForForm(detail.mode),
  };
  const meta = asRecord(detail.meta);
  const visibility = asRecord(meta.visibility);
  const budget = asRecord(meta.budget);
  const detailModelConfig = asRecord(detail.modelConfig);
  const modelKey =
    toText(detailModelConfig.modelKey) ||
    toText(meta.modelKey) ||
    toText(detail.model);
  if (modelKey || Object.keys(detailModelConfig).length > 0) {
    definition.modelConfig = {
      ...detailModelConfig,
      ...(modelKey ? { modelKey } : {}),
    };
  }
  if (Array.isArray(detail.tools))
    definition.toolConfig = { tools: detail.tools };
  if (Array.isArray(detail.skills))
    definition.skillConfig = { skills: detail.skills };
  if (Array.isArray(detail.greetings)) definition.greetings = detail.greetings;
  if (Array.isArray(detail.wonders)) definition.wonders = detail.wonders;
  if (Array.isArray(detail.controls)) definition.controls = detail.controls;
  if (Array.isArray(visibility.scopes))
    definition.visibility = { scopes: visibility.scopes };
  if (Object.keys(budget).length > 0) definition.budget = budget;
  return definition;
}

export function formFromDetail(detail: EditableAgentDetail): AgentFormState {
  const definition = detail.definition || fallbackDefinition(detail);
  const modelConfig = asRecord(definition.modelConfig);
  const reasoning = asRecord(modelConfig.reasoning);
  const reasoningEffort = normalizeReasoningEffort(reasoning.effort);
  const toolConfig = asRecord(definition.toolConfig);
  const skillConfig = asRecord(definition.skillConfig);
  const contextConfig = asRecord(definition.contextConfig);
  const meta = asRecord(detail.meta);
  const definitionVisibility = asRecord(definition.visibility);
  const metaVisibility = asRecord(meta.visibility);
  const definitionBudget = asRecord(definition.budget);
  const metaBudget = asRecord(meta.budget);
  const budget =
    Object.keys(definitionBudget).length > 0 ? definitionBudget : metaBudget;
  return {
    key: toText(definition.key) || detail.key,
    name: toText(definition.name) || detail.name || detail.key,
    ...iconFieldsFromValue(definition.icon ?? detail.icon),
    role: toText(definition.role) || detail.role || "",
    description: toText(definition.description) || detail.description || "",
    mode: normalizeModeForForm(
      toText(definition.mode) || detail.mode || "REACT",
    ),
    modelKey:
      toText(modelConfig.modelKey) || resolveModelKey(detail, definition),
    serviceTier: normalizeServiceTier(modelConfig.serviceTier),
    reasoningConfigured: Object.prototype.hasOwnProperty.call(
      modelConfig,
      "reasoning",
    ),
    reasoningEnabled:
      reasoning.enabled !== false &&
      (reasoning.enabled === true || Boolean(reasoningEffort)),
    reasoningEffort,
    tools: textListFromUnknown(toolConfig.tools || detail.tools),
    skills: textListFromUnknown(skillConfig.skills || detail.skills),
    greetingsText: stringifyJson(
      definition.greetings ?? detail.greetings ?? [],
      "[]",
    ),
    wondersText: stringifyJson(
      definition.wonders ?? detail.wonders ?? [],
      "[]",
    ),
    contextTags: textListFromUnknown(
      contextConfig.tags || definition.contextTags,
    ),
    visibilityScopes: (() => {
      const definitionScopes = textListFromUnknown(definitionVisibility.scopes);
      if (definitionScopes.length > 0) return definitionScopes;
      const metaScopes = textListFromUnknown(metaVisibility.scopes);
      return metaScopes.length > 0 ? metaScopes : ["nav"];
    })(),
    budgetText: stringifyJson(budget),
    controlsText: stringifyJson(
      definition.controls || detail.controls || [],
      "[]",
    ),
    runtimeConfigText: stringifyJson(definition.runtimeConfig),
    memoryConfigText: stringifyJson(definition.memoryConfig),
    proxyConfigText: stringifyJson(definition.proxyConfig),
    soulPrompt: detail.soulPrompt || "",
    agentsPrompt: detail.agentsPrompt || "",
  };
}

export function buildDefinition(
  form: AgentFormState,
  baseDefinition: Record<string, unknown>,
  t: Translate,
  reasoningSupported?: boolean,
): Record<string, unknown> {
  const definition = { ...baseDefinition };
  definition.key = form.key.trim();
  definition.name = form.name.trim();
  const icon = buildIconValue(form);
  if (icon) definition.icon = icon;
  else delete definition.icon;
  definition.role = form.role.trim();
  definition.description = form.description.trim();
  definition.mode = normalizeModeForForm(form.mode);

  const modelKey = form.modelKey.trim();
  if (modelKey) {
    const modelConfig: Record<string, unknown> = {
      ...asRecord(definition.modelConfig),
      modelKey,
    };
    const serviceTier = normalizeServiceTier(form.serviceTier);
    if (serviceTier !== "STANDARD") modelConfig.serviceTier = serviceTier;
    else delete modelConfig.serviceTier;
    if (reasoningSupported === true && form.reasoningConfigured) {
      const reasoning = { ...asRecord(modelConfig.reasoning) };
      if (form.reasoningEnabled) {
        reasoning.enabled = true;
        const effort = normalizeReasoningEffort(form.reasoningEffort);
        if (effort) reasoning.effort = effort;
        else delete reasoning.effort;
      } else {
        reasoning.enabled = false;
        delete reasoning.effort;
      }
      modelConfig.reasoning = reasoning;
    } else if (reasoningSupported === false) {
      delete modelConfig.reasoning;
    }
    definition.modelConfig = modelConfig;
  } else delete definition.modelConfig;

  const tools = form.tools.map((item) => item.trim()).filter(Boolean);
  if (tools.length > 0)
    definition.toolConfig = { ...asRecord(definition.toolConfig), tools };
  else delete definition.toolConfig;

  const skills = form.skills.map((item) => item.trim()).filter(Boolean);
  if (skills.length > 0)
    definition.skillConfig = { ...asRecord(definition.skillConfig), skills };
  else delete definition.skillConfig;

  const greetings = parseJsonField(
    t("agentConsole.field.greetings"),
    form.greetingsText,
    t,
    { expectArray: true },
  );
  if (greetings === undefined) delete definition.greetings;
  else definition.greetings = greetings;

  const wonders = parseJsonField(
    t("agentConsole.field.wonders"),
    form.wondersText,
    t,
    { expectArray: true },
  );
  if (wonders === undefined) delete definition.wonders;
  else definition.wonders = wonders;

  const contextTags = form.contextTags
    .map((item) => item.trim())
    .filter(Boolean);
  if (contextTags.length > 0) {
    definition.contextConfig = {
      ...asRecord(definition.contextConfig),
      tags: contextTags,
    };
    delete definition.contextTags;
  } else {
    const existingContextConfig = asRecord(definition.contextConfig);
    delete existingContextConfig.tags;
    if (Object.keys(existingContextConfig).length > 0)
      definition.contextConfig = existingContextConfig;
    else delete definition.contextConfig;
    delete definition.contextTags;
  }

  const visibilityScopes = form.visibilityScopes
    .map((item) => item.trim())
    .filter(Boolean);
  if (visibilityScopes.length > 0) {
    definition.visibility = {
      ...asRecord(definition.visibility),
      scopes: visibilityScopes,
    };
  } else {
    delete definition.visibility;
  }

  const budget = parseJsonField("Budget", form.budgetText, t);
  if (budget === undefined) delete definition.budget;
  else definition.budget = budget;

  definition.controls = parseJsonField("Controls", form.controlsText, t, {
    expectArray: true,
  });
  for (const [key, label, value] of [
    ["runtimeConfig", "Runtime Config", form.runtimeConfigText],
    ["memoryConfig", "Memory Config", form.memoryConfigText],
  ] as const) {
    const parsed = parseJsonField(label, value, t);
    if (parsed === undefined) delete definition[key];
    else definition[key] = parsed;
  }
  if (definition.mode === "PROXY") {
    definition.proxyConfig = parseJsonField(
      "Proxy Config",
      form.proxyConfigText,
      t,
      { allowEmpty: false },
    );
  } else {
    delete definition.proxyConfig;
  }
  return definition;
}

const AGENT_CONSOLE_CLASS_NAME = "agent-console tw:overflow-hidden";
const AGENT_ERROR_CLASS_NAME =
  "agent-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const AGENT_BODY_CLASS_NAME =
  "agent-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[280px_minmax(0,1fr)] tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const AGENT_DETAIL_CLASS_NAME =
  "agent-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto tw:[&_.ant-select]:min-w-0 tw:[&_.ant-select]:w-full tw:[&_select]:min-h-8 tw:[&_select]:w-full tw:[&_select]:rounded-control tw:[&_select]:border tw:[&_select]:px-2 tw:[&_select]:py-1.5 tw:[&_select]:text-xs tw:[&_select]:text-ink-1 tw:[&_select]:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:[&_select]:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))]";
const AGENT_DETAIL_ADMIN_META_CLASS_NAME =
  "agent-detail-admin-meta tw:mb-3.5 tw:flex tw:flex-col tw:gap-2";
const AGENT_DIAGNOSTICS_CLASS_NAME =
  "agent-diagnostics tw:flex tw:flex-col tw:gap-1.5 tw:rounded-control tw:border tw:p-2.5 tw:text-xs tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--accent-danger)_26%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_6%,transparent)] tw:[&>strong]:font-bold tw:[&>strong]:text-accent-danger";
const AGENT_DIAGNOSTIC_ITEM_CLASS_NAME =
  "agent-diagnostic-item tw:flex tw:min-w-0 tw:flex-col tw:gap-[3px]";
const AGENT_DIAGNOSTIC_CODE_CLASS_NAME =
  "agent-diagnostic-code tw:text-[11px] tw:font-bold tw:text-ink-muted";
const AGENT_FORM_GRID_CLASS_NAME =
  "agent-form-grid tw:grid tw:grid-cols-3 tw:max-[860px]:grid-cols-1 tw:[&_.field-group]:mb-0";
const AGENT_FORM_FULL_WIDTH_CLASS_NAME =
  "field-group agent-form-full-width tw:col-span-3 tw:max-[860px]:col-span-1";
const AGENT_SECTION_NAV_CLASS_NAME =
  "agent-section-nav tw:sticky tw:top-0 tw:flex tw:items-center tw:gap-1";
const AGENT_SECTION_NAV_LINKS_CLASS_NAME =
  "agent-section-nav-links tw:flex tw:min-w-0 tw:flex-1 tw:overflow-x-auto";
const AGENT_SECTION_NAV_LINK_CLASS_NAME =
  "agent-section-nav-link tw:flex-none tw:whitespace-nowrap";
const AGENT_SECTION_NAV_ACTIONS_CLASS_NAME =
  "agent-section-nav-actions tw:ml-auto tw:flex tw:flex-none tw:items-center tw:gap-1";
const AGENT_SECTION_NAV_ICON_BUTTON_CLASS_NAME =
  "agent-section-nav-icon-button ui-icon-hover-24";
const AGENT_SECTION_NAV_SAVE_CLASS_NAME = "agent-section-nav-save tw:flex-none";
const AGENT_FORM_SECTION_CLASS_NAME = "agent-form-section";
const AGENT_FORM_SECTION_HEADING_CLASS_NAME =
  "agent-form-section-heading tw:flex tw:items-center tw:gap-1.5";
const AGENT_MONO_TEXTAREA_CLASS_NAME =
  "settings-textarea agent-mono-textarea tw:font-code";
const AGENT_PROMPT_TEXTAREA_CLASS_NAME =
  "settings-textarea agent-prompt-textarea tw:min-h-[120px]";
const AGENT_SOURCE_EDITOR_CLASS_NAME =
  "settings-textarea agent-source-editor tw:min-h-0 tw:flex-1 tw:resize-none tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80 tw:max-[860px]:flex-none tw:max-[860px]:resize-y";
const AGENT_DIRTY_CLASS_NAME =
  "agent-source-dirty tw:text-[11px] tw:text-ink-muted";
const AGENT_UNEDITABLE_CLASS_NAME =
  "agent-console-uneditable tw:flex tw:items-center tw:gap-2 tw:rounded-control tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_26%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_6%,transparent)]";
const AGENT_SAVE_ACTIONS_CLASS_NAME =
  "agent-save-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2";

export const AGENT_FORM_SECTION_IDS = [
  "agent-section-basic",
  "agent-section-model",
  "agent-section-prompts",
  "agent-section-context-capabilities",
  "agent-section-advanced",
] as const;

export type AgentFormSectionId = (typeof AGENT_FORM_SECTION_IDS)[number];

interface AgentFormSectionProps {
  children: React.ReactNode;
  icon: MaterialIconName;
  id: AgentFormSectionId;
  title: string;
}

const AgentFormSection: React.FC<AgentFormSectionProps> = ({
  children,
  icon,
  id,
  title,
}) => {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className={AGENT_FORM_SECTION_CLASS_NAME}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className={AGENT_FORM_SECTION_HEADING_CLASS_NAME}>
        <MaterialIcon name={icon} />
        <h3 id={titleId}>{title}</h3>
      </div>
      {children}
    </section>
  );
};

export const AgentConsole: React.FC<AgentConsoleProps> = ({
  selectedAgentKey = "",
  onSelectAgentKey,
  onClearSelection,
  onClose,
  titleBarVariant = "default",
  onDirtyChange,
  embedded = false,
}) => {
  const { t } = useI18n();
  const { state, dispatch } = useAppContext();
  const [internalSelectedKey, setInternalSelectedKey] = useState("");
  const effectiveSelectedKey = selectedAgentKey || internalSelectedKey;
  const [localAgents, setLocalAgents] = useState<Agent[]>([]);
  const [searchText, setSearchText] = useState("");
  const [formMode, setFormMode] = useState<AgentFormMode>("create");
  const [editorMode, setEditorMode] = useState<AgentEditorMode>("structured");
  const [interactionMode, setInteractionMode] =
    useState<AgentInteractionMode>("edit");
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const [form, setForm] = useState<AgentFormState>(createEmptyAgentForm);
  const [detail, setDetail] = useState<EditableAgentDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [editorOptions, setEditorOptions] =
    useState<AgentEditorOptionsResponse | null>(null);
  const [toolOptions, setToolOptions] = useState<AgentToolOption[]>([]);
  const [toolSearchText, setToolSearchText] = useState("");
  const [toolFilter, setToolFilter] = useState<AgentToolFilter>("all");
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [skillSearchText, setSkillSearchText] = useState("");
  const [skillOptions, setSkillOptions] = useState<
    Array<{ key: string; label: string; description?: string }>
  >([]);
  const [savingForm, setSavingForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [privateSkillModalOpen, setPrivateSkillModalOpen] = useState(false);
  const [privateSkillFile, setPrivateSkillFile] = useState<File | null>(null);
  const [privateSkillDragActive, setPrivateSkillDragActive] = useState(false);
  const [privateSkillImporting, setPrivateSkillImporting] = useState(false);
  const [privateSkillError, setPrivateSkillError] = useState("");
  const [deletingPrivateSkillKey, setDeletingPrivateSkillKey] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [draggingAgentKey, setDraggingAgentKey] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceSha256, setSourceSha256] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [sourceLoadedKey, setSourceLoadedKey] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [structuredDirty, setStructuredDirty] = useState(false);
  const [activeAgentSectionId, setActiveAgentSectionId] =
    useState<AgentFormSectionId>(AGENT_FORM_SECTION_IDS[0]);
  const didInitialSelectRef = useRef(false);
  const {
    didBootstrapAgentsRef,
    didBootstrapOptionsRef,
    listLoadSeqRef,
    optionsLoadSeqRef,
    sourceLoadSeqRef,
  } = useAgentConsoleRuntime();
  const selectedAgentKeyRef = useRef(selectedAgentKey);
  const loadedDetailKeyRef = useRef("");
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const sectionNavRef = useRef<HTMLElement>(null);
  const privateSkillFileInputRef = useRef<HTMLInputElement>(null);
  const filteredAgents = useMemo(() => {
    const agents = Array.isArray(localAgents) ? localAgents : [];
    return filterAgentsPreservingOrder(agents, searchText);
  }, [searchText, localAgents]);
  const modeOptions = useMemo(() => {
    const availableModes = new Map(
      (editorOptions?.modes || []).map((item) => [
        normalizeModeForForm(item.key),
        item.label || item.key,
      ]),
    );
    return ["REACT", "CODER", "KBASE"].map((value) => ({
      value,
      label: availableModes.get(value) || value,
    }));
  }, [editorOptions]);
  const selectedModelReasoningEfforts = useMemo(
    () => getModelReasoningEfforts(editorOptions?.models, form.modelKey),
    [editorOptions, form.modelKey],
  );
  const selectedModelReasoningSupported = toText(form.modelKey)
    ? selectedModelReasoningEfforts.length > 0
    : undefined;
  const selectedModel = useMemo(
    () =>
      (editorOptions?.models || []).find(
        (model) => toText(model.key) === toText(form.modelKey),
      ),
    [editorOptions, form.modelKey],
  );
  const agentModelOptions = useMemo(
    () => (editorOptions?.models || []) as CoderModelOption[],
    [editorOptions],
  );
  const modelReasoningOptions = useMemo(
    () =>
      selectedModelReasoningEfforts.map((key) => ({
        key: key as QueryReasoningEffort,
        label: reasoningEffortLabel(key, t),
      })),
    [selectedModelReasoningEfforts, t],
  );
  const modelServiceTierOptions = useMemo<ServiceTierOption[]>(() => {
    const tiers = selectedModel?.serviceTiers || [];
    const uniqueTiers = new Set(["STANDARD", ...tiers]);
    return [...uniqueTiers].map((key) => ({ key, label: key }));
  }, [selectedModel]);
  const selectedModelLabel =
    toText(selectedModel?.name) || toText(form.modelKey) ||
    t("composer.query.model.loading");
  const selectedReasoningLabel = form.reasoningEnabled
    ? reasoningEffortLabel(form.reasoningEffort, t)
    : t("agentConsole.state.disabled");
  const selectedServiceTier = normalizeServiceTier(form.serviceTier);
  const showFastBadge = selectedServiceTier === "FAST";
  const queryModelButtonStateClass = loadingOptions
    ? "is-loading tw:pointer-events-auto"
    : "";
  const modelItems = useMemo<MenuProps["items"]>(
    () =>
      buildModelMenuItems({
        models: agentModelOptions,
        reasoningEfforts: modelReasoningOptions,
        serviceTiers: modelServiceTierOptions,
        modelOverride: {
          key: form.modelKey,
          ...(form.reasoningEnabled
            ? { reasoningEffort: normalizeReasoningEffort(form.reasoningEffort) as QueryReasoningEffort }
            : {}),
          ...(selectedServiceTier !== "STANDARD"
            ? { serviceTier: selectedServiceTier }
            : {}),
        },
        selectedModelLabel,
        selectedModelKey: form.modelKey,
        selectedReasoningEffort: form.reasoningEnabled
          ? (normalizeReasoningEffort(form.reasoningEffort) as QueryReasoningEffort)
          : undefined,
        selectedServiceTier,
        modelsLoading: loadingOptions,
        status: agentModelOptions.length > 0 ? "loaded" : "empty",
        t,
      }),
    [
      agentModelOptions,
      form.modelKey,
      form.reasoningEffort,
      form.reasoningEnabled,
      loadingOptions,
      modelReasoningOptions,
      modelServiceTierOptions,
      selectedModelLabel,
      selectedServiceTier,
      t,
    ],
  );
  const contextTagOptions = useMemo(
    () =>
      (editorOptions?.contextTags || []).map((item) => ({
        value: item.key,
        label: item.label || item.key,
      })),
    [editorOptions],
  );
  const visibilityScopeOptions = useMemo(
    () =>
      (editorOptions?.visibilityScopes?.length
        ? editorOptions.visibilityScopes
        : [
            { key: "nav", label: "nav" },
            { key: "copilot", label: "copilot" },
            { key: "invoke", label: "invoke" },
            { key: "internal", label: "internal" },
          ]
      ).map((item) => ({ value: item.key, label: item.label || item.key })),
    [editorOptions],
  );
  const privateSkills = useMemo(
    () => privateSkillsFromDetail(detail),
    [detail],
  );
  const agentSkillOptions = useMemo(
    () => mergeAgentSkillOptions(skillOptions, privateSkills, form.skills, t),
    [form.skills, privateSkills, skillOptions, t],
  );
  const filteredToolOptions = useMemo(() => {
    const query = toolSearchText.trim().toLowerCase();
    return toolOptions.filter((tool) => {
      if (toolFilter !== "all" && toolFilterForOption(tool) !== toolFilter) {
        return false;
      }
      if (!query) return true;
      return `${tool.key} ${tool.label} ${tool.kind} ${tool.sourceCategory}`
        .toLowerCase()
        .includes(query);
    });
  }, [toolFilter, toolOptions, toolSearchText]);
  const selectedTools = useMemo(
    () =>
      form.tools.map((key) =>
        toolOptions.find((tool) => tool.key === key) || {
          key,
          label: key,
          sourceCategory: "",
          kind: "",
        },
      ),
    [form.tools, toolOptions],
  );
  const selectedSkills = useMemo(
    () =>
      form.skills.map(
        (key) =>
          agentSkillOptions.find((skill) => skill.key === key) || {
            key,
            label: key,
            source: "center" as const,
          },
      ),
    [agentSkillOptions, form.skills],
  );
  const filteredSkillOptions = useMemo(() => {
    const query = skillSearchText.trim().toLowerCase();
    if (!query) return agentSkillOptions;
    return agentSkillOptions.filter((skill) =>
      `${skill.key} ${skill.label} ${skill.description || ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [agentSkillOptions, skillSearchText]);
  const greetingEntries = useMemo(
    () => promptEntriesFromJson(form.greetingsText),
    [form.greetingsText],
  );
  const wonderEntries = useMemo(
    () => promptEntriesFromJson(form.wondersText),
    [form.wondersText],
  );
  const agentFormSections = useMemo<
    Array<{
      id: AgentFormSectionId;
      label: string;
    }>
  >(
    () => [
      {
        id: AGENT_FORM_SECTION_IDS[0],
        label: t("agentConsole.section.basic"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[1],
        label: t("agentConsole.section.model"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[3],
        label: t("agentConsole.section.capabilities"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[2],
        label: t("agentConsole.section.prompts"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[4],
        label: t("agentConsole.section.advancedConfig"),
      },
    ],
    [t],
  );
  const selectedIconValue = useMemo(() => {
    if (form.iconKind === "image") return form.iconImage;
    if (form.iconKind === "builtin" && form.iconName)
      return { name: form.iconName };
    return undefined;
  }, [form.iconImage, form.iconKind, form.iconName]);
  const detailDiagnostics = useMemo(
    () => readAdminAgentDiagnostics(detail),
    [detail],
  );
  const detailSourcePath = useMemo(
    () => sourcePath || resolveAdminAgentSourcePath(detail),
    [detail, sourcePath],
  );
  const canEditStructuredAgent =
    formMode === "create" || hasEditableAdminDefinition(detail);
  const isReadOnly = formMode === "edit" && interactionMode === "view";
  const canEditSourceAgent =
    formMode === "edit" && !isReadOnly && Boolean(detailSourcePath);
  const hasUnsavedChanges = structuredDirty || sourceDirty;
  const canImportPrivateSkill =
    formMode === "edit" &&
    !isReadOnly &&
    canEditStructuredAgent &&
    toText(detail?.source?.kind).toLowerCase() === "directory" &&
    !savingForm &&
    !deleting &&
    !privateSkillImporting &&
    !deletingPrivateSkillKey;

  useEffect(() => {
    selectedAgentKeyRef.current = selectedAgentKey;
  }, [selectedAgentKey]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    setActiveAgentSectionId(AGENT_FORM_SECTION_IDS[0]);
  }, [effectiveSelectedKey, editorMode]);

  useEffect(() => {
    const root = detailScrollRef.current;
    if (!root || editorMode !== "structured" || !canEditStructuredAgent)
      return;

    const sections = AGENT_FORM_SECTION_IDS.map((id) =>
      root.querySelector<HTMLElement>(`#${id}`),
    ).filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    let frameId: number | null = null;
    const updateActiveSection = () => {
      frameId = null;
      const rootTop = root.getBoundingClientRect().top;
      const navHeight =
        sectionNavRef.current?.getBoundingClientRect().height ?? 0;
      const nextSectionId = getActiveAgentSectionId(
        sections.map((section) => ({
          id: section.id as AgentFormSectionId,
          top: section.getBoundingClientRect().top,
        })),
        rootTop + navHeight + 8,
        {
          atScrollEnd:
            root.scrollTop + root.clientHeight >= root.scrollHeight - 1,
        },
      );
      if (!nextSectionId) return;
      setActiveAgentSectionId((current) =>
        current === nextSectionId ? current : nextSectionId,
      );
    };
    const scheduleActiveSectionUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateActiveSection);
    };

    root.addEventListener("scroll", scheduleActiveSectionUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleActiveSectionUpdate);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleActiveSectionUpdate);
    resizeObserver?.observe(root);
    sections.forEach((section) => resizeObserver?.observe(section));
    updateActiveSection();

    return () => {
      root.removeEventListener("scroll", scheduleActiveSectionUpdate);
      window.removeEventListener("resize", scheduleActiveSectionUpdate);
      resizeObserver?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [canEditStructuredAgent, editorMode, form.key]);

  useEffect(() => {
    setIconEditorOpen(false);
  }, [editorMode, effectiveSelectedKey, formMode]);

  const commitAgentSelection = useCallback(
    (agentKey: string) => {
      const key = agentKey.trim();
      sourceLoadSeqRef.current += 1;
      setInternalSelectedKey(key);
      if (key) onSelectAgentKey?.(key);
    },
    [onSelectAgentKey],
  );

  const resetToCreate = useCallback(() => {
    sourceLoadSeqRef.current += 1;
    loadedDetailKeyRef.current = "";
    setFormMode("create");
    setEditorMode("structured");
    setInteractionMode(initialAgentInteractionMode("create"));
    setForm(createEmptyAgentForm());
    setDetail(null);
    setSourceDraft("");
    setSourceSha256("");
    setSourcePath("");
    setSourceLoadedKey("");
    setSourceDirty(false);
    setStructuredDirty(false);
    setInternalSelectedKey("");
    setFormError("");
    setError("");
    onClearSelection?.();
  }, [onClearSelection]);

  const confirmDiscardChanges = useCallback(
    () =>
      confirmAgentDraftDiscard(
        hasUnsavedChanges,
        t("agentConsole.confirm.switch"),
      ),
    [hasUnsavedChanges, t],
  );

  const selectAgent = useCallback(
    (agentKey: string) => {
      const key = agentKey.trim();
      if (key === effectiveSelectedKey) {
        if (isReadOnly) {
          setInteractionMode("edit");
          setFormError("");
        }
        return;
      }
      if (!confirmDiscardChanges()) return;
      commitAgentSelection(key);
    },
    [
      commitAgentSelection,
      confirmDiscardChanges,
      effectiveSelectedKey,
      isReadOnly,
    ],
  );

  const startDirectCreate = useCallback(() => {
    if (!confirmDiscardChanges()) return false;
    resetToCreate();
    setCreateModalOpen(false);
    return true;
  }, [confirmDiscardChanges, resetToCreate]);

  const openCreateModal = useCallback(() => {
    setCreateModalOpen(true);
  }, []);

  const loadAgents = useCallback(
    async (preferredKey = "") => {
      const requestSeq = listLoadSeqRef.current + 1;
      listLoadSeqRef.current = requestSeq;
      setLoadingList(true);
      setError("");
      try {
        const response = await getAdminAgents();
        if (listLoadSeqRef.current !== requestSeq) return;
        const agents = Array.isArray(response.data)
          ? (response.data as Agent[])
          : [];
        setLocalAgents(agents);
        const normalizedPreferred = preferredKey.trim();
        const nextKey =
          normalizedPreferred &&
          agents.some((agent) => toText(agent.key) === normalizedPreferred)
            ? normalizedPreferred
            : agents[0]?.key || "";
        if (
          !selectedAgentKeyRef.current &&
          nextKey &&
          !didInitialSelectRef.current
        ) {
          didInitialSelectRef.current = true;
          setInternalSelectedKey(nextKey);
        }
      } catch (error) {
        if (listLoadSeqRef.current !== requestSeq) return;
        setError((error as Error).message);
      } finally {
        if (listLoadSeqRef.current === requestSeq) {
          setLoadingList(false);
        }
      }
    },
    [dispatch],
  );

  const refreshGlobalAgents = useCallback(async () => {
    try {
      const agentsResponse = await getAgents();
      const agents = Array.isArray(agentsResponse.data)
        ? (agentsResponse.data as Agent[])
        : [];
      dispatch({ type: "SET_AGENTS", agents });
    } catch {
      // 静默失败，不影响主流程
    }
  }, [dispatch]);

  const importAgentArchive = useCallback(
    async (file: File, overwrite: boolean) => {
      const response = await importAdminAgent({ file, overwrite });
      return response.data;
    },
    [],
  );

  const finishAgentArchiveImport = useCallback(
    async (imported: AdminAgentDetailResponse) => {
      const importedKey = toText(imported.key);
      setDetail(imported);
      setForm(formFromDetail(imported));
      setFormMode("edit");
      setEditorMode("structured");
      setSourceDraft("");
      setSourceSha256("");
      setSourcePath("");
      setSourceLoadedKey("");
      setSourceDirty(false);
      setStructuredDirty(false);
      setFormError("");
      commitAgentSelection(importedKey);
      setCreateModalOpen(false);
      await loadAgents(importedKey);
      await refreshGlobalAgents();
      const resultMessageKey = agentImportSuccessMessageKey(imported.status);
      if (imported.status === "invalid") {
        message.warning(t(resultMessageKey));
      } else {
        message.success(t(resultMessageKey));
      }
    },
    [commitAgentSelection, loadAgents, refreshGlobalAgents, t],
  );

  const saveAgentOrder = useCallback(async (agents: Agent[]) => {
    setSavingOrder(true);
    setError("");
    try {
      await saveAgentOrderRequest(agents);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSavingOrder(false);
    }
  }, []);

  const handleMoveAgent = useCallback(
    async (sourceKey: string, targetKey: string) => {
      if (!sourceKey || !targetKey || sourceKey === targetKey || savingOrder)
        return;
      const nextAgents = moveAgentForDrop(localAgents, sourceKey, targetKey);
      if (nextAgents === localAgents) return;
      setLocalAgents(nextAgents);
      await saveAgentOrder(nextAgents);
    },
    [saveAgentOrder, savingOrder, localAgents],
  );

  const loadEditorOptions = useCallback(async () => {
    const requestSeq = optionsLoadSeqRef.current + 1;
    optionsLoadSeqRef.current = requestSeq;
    setLoadingOptions(true);
    try {
      const [optionsResponse, toolsResponse, skillsResponse] =
        await Promise.all([
          getAdminAgentEditorOptions(),
          getAdminTools(),
          getAdminSkills(),
        ]);
      if (optionsLoadSeqRef.current !== requestSeq) return;
      setEditorOptions(
        (optionsResponse.data || null) as AgentEditorOptionsResponse | null,
      );
      setToolOptions(
        (Array.isArray(toolsResponse.data) ? toolsResponse.data : [])
          .map(buildAdminToolOption)
          .filter((item): item is AgentToolOption => Boolean(item)),
      );
      setSkillOptions(
        (Array.isArray(skillsResponse.data) ? skillsResponse.data : [])
          .map((item) => {
            const record = asRecord(item);
            const key = toText(record.key);
            if (!key) return null;
            const description = toText(record.description);
            return description
              ? { key, label: optionLabel(record) || key, description }
              : { key, label: optionLabel(record) || key };
          })
          .filter((item): item is { key: string; label: string; description?: string } =>
            Boolean(item),
          ),
      );
    } catch (error) {
      if (optionsLoadSeqRef.current !== requestSeq) return;
      setError((error as Error).message);
    } finally {
      if (optionsLoadSeqRef.current === requestSeq) {
        setLoadingOptions(false);
      }
    }
  }, []);

  const loadDetail = useCallback(async (agentKey: string) => {
    const key = agentKey.trim();
    if (!key) return;
    sourceLoadSeqRef.current += 1;
    setLoadingDetail(true);
    setEditorMode("structured");
    setInteractionMode(initialAgentInteractionMode("edit"));
    setSourceDraft("");
    setSourceSha256("");
    setSourcePath("");
    setSourceLoadedKey("");
    setSourceDirty(false);
    setStructuredDirty(false);
    setError("");
    setFormError("");
    try {
      const response = await getAdminAgentDetail(key);
      const nextDetail = response.data as EditableAgentDetail;
      setDetail(nextDetail);
      setForm(formFromDetail(nextDetail));
      setFormMode("edit");
    } catch (error) {
      setDetail(null);
      setFormMode("edit");
      setForm({ ...EMPTY_FORM, key });
      setFormError((error as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!shouldStartAgentConsoleBootstrap(didBootstrapAgentsRef)) return;
    void loadAgents(selectedAgentKey);
  }, [loadAgents, selectedAgentKey]);

  useEffect(() => {
    if (!shouldStartAgentConsoleBootstrap(didBootstrapOptionsRef)) return;
    void loadEditorOptions();
  }, [loadEditorOptions]);

  useEffect(() => {
    if (selectedAgentKey) setInternalSelectedKey(selectedAgentKey);
  }, [selectedAgentKey]);

  useEffect(() => {
    if (
      !shouldReloadAgentDetail(
        loadedDetailKeyRef.current,
        effectiveSelectedKey,
      )
    ) {
      return;
    }
    loadedDetailKeyRef.current = effectiveSelectedKey;
    void loadDetail(effectiveSelectedKey);
  }, [effectiveSelectedKey, loadDetail]);

  useEffect(() => {
    if (effectiveSelectedKey || localAgents.length !== 0 || loadingList) return;
    loadedDetailKeyRef.current = "";
    resetToCreate();
  }, [effectiveSelectedKey, loadingList, resetToCreate, localAgents.length]);

  const updateForm = (patch: Partial<AgentFormState>) => {
    if (isReadOnly) return;
    setForm((current) => ({ ...current, ...patch }));
    setStructuredDirty(true);
    setFormError("");
  };

  const setModelKey = (value?: string) => {
    const modelKey = toText(value);
    if (editorOptions) {
      const efforts = getModelReasoningEfforts(editorOptions.models, modelKey);
      if (efforts.length === 0) {
        updateForm({
          modelKey,
          reasoningConfigured: false,
          reasoningEnabled: false,
          reasoningEffort: "",
        });
        return;
      }
      if (
        form.reasoningEnabled &&
        !efforts.includes(normalizeReasoningEffort(form.reasoningEffort))
      ) {
        updateForm({
          modelKey,
          reasoningConfigured: true,
          reasoningEffort: defaultReasoningEffort(efforts),
        });
        return;
      }
    }
    updateForm({ modelKey });
  };

  const setReasoningEffort = (value?: string) => {
    const effort = normalizeReasoningEffort(value);
    updateForm({
      reasoningConfigured: true,
      reasoningEnabled: Boolean(effort),
      reasoningEffort: effort,
    });
  };

  const onModelMenuClick: MenuProps["onClick"] = ({ key }) => {
    const itemKey = String(key);
    if (itemKey.startsWith("model:")) {
      setModelKey(decodeURIComponent(itemKey.slice("model:".length)));
      return;
    }
    if (itemKey.startsWith("reasoning:")) {
      setReasoningEffort(itemKey.slice("reasoning:".length));
      return;
    }
    if (itemKey.startsWith("serviceTier:")) {
      updateForm({
        serviceTier: normalizeServiceTier(
          itemKey.slice("serviceTier:".length),
        ),
      });
    }
  };

  const onModelMenuOpenChange = (open: boolean) => {
    if (open && !loadingOptions && !editorOptions) void loadEditorOptions();
  };

  const saveForm = async () => {
    if (!canEditStructuredAgent) {
      setFormError(t("agentConsole.error.structuredSaveUnavailable"));
      return;
    }
    if (!form.key.trim()) {
      setFormError(t("agentConsole.error.keyRequired"));
      return;
    }
    if (!form.name.trim()) {
      setFormError(t("agentConsole.error.nameRequired"));
      return;
    }
    setSavingForm(true);
    setError("");
    setFormError("");
    try {
      const baseDefinition =
        formMode === "edit" && detail
          ? detail.definition || fallbackDefinition(detail)
          : {};
      const definition = buildDefinition(
        form,
        baseDefinition,
        t,
        selectedModelReasoningSupported,
      );
      const response =
        formMode === "create"
          ? await createAgent({
              key: form.key.trim(),
              definition,
              soulPrompt: form.soulPrompt,
              agentsPrompt: form.agentsPrompt,
            })
          : await updateAgent({
              key: form.key.trim(),
              definition,
              soulPrompt: form.soulPrompt,
              agentsPrompt: form.agentsPrompt,
            });
      const saved = response.data;
      const savedKey = saved.key || form.key.trim();
      setDetail(saved);
      setForm(formFromDetail(saved));
      setFormMode("edit");
      setEditorMode("structured");
      setInteractionMode("edit");
      setSourceDraft("");
      setSourceSha256("");
      setSourcePath("");
      setSourceLoadedKey("");
      setSourceDirty(false);
      setStructuredDirty(false);
      message.success(t("agentConsole.message.saveSuccess"));
      await loadAgents(savedKey);
      await refreshGlobalAgents();
      commitAgentSelection(savedKey);
    } catch (error) {
      const errorMessage = (error as Error).message;
      setFormError(errorMessage);
      message.error(
        t("agentConsole.message.saveFailed", { detail: errorMessage }),
      );
    } finally {
      setSavingForm(false);
    }
  };

  const resetPrivateSkillImport = () => {
    setPrivateSkillFile(null);
    setPrivateSkillDragActive(false);
    setPrivateSkillError("");
    if (privateSkillFileInputRef.current)
      privateSkillFileInputRef.current.value = "";
  };

  const selectPrivateSkillArchive = (file: File | null) => {
    setPrivateSkillFile(file);
    setPrivateSkillError("");
  };

  const openPrivateSkillImport = () => {
    if (!canImportPrivateSkill) return;
    resetPrivateSkillImport();
    setPrivateSkillModalOpen(true);
  };

  const submitPrivateSkillImport = async () => {
    const agentKey = form.key.trim();
    if (!agentKey || !privateSkillFile) {
      setPrivateSkillError(t("agentConsole.privateSkill.import.required"));
      return;
    }
    setPrivateSkillImporting(true);
    setPrivateSkillError("");
    const hadUnsavedChanges = hasUnsavedChanges;
    try {
      const response = await importAdminAgentPrivateSkill({
        agentKey,
        file: privateSkillFile,
      });
      const saved = response.data;
      setDetail(saved);
      setForm((current) => {
        const imported = formFromDetail(saved);
        return {
          ...imported,
          ...current,
          skills: [...new Set([...imported.skills, ...current.skills])],
        };
      });
      setStructuredDirty(hadUnsavedChanges);
      setPrivateSkillModalOpen(false);
      resetPrivateSkillImport();
      await loadAgents(agentKey);
      await refreshGlobalAgents();
      commitAgentSelection(agentKey);
      message.success(t("agentConsole.privateSkill.import.success"));
    } catch (error) {
      const detail = (error as Error).message;
      setPrivateSkillError(detail);
    } finally {
      setPrivateSkillImporting(false);
    }
  };

  const confirmDeletePrivateSkill = (skill: AdminAgentPrivateSkill) => {
    const agentKey = form.key.trim();
    if (!agentKey || !skill.key || hasUnsavedChanges) return;
    Modal.confirm({
      title: t("agentConsole.privateSkill.delete.title"),
      content: t("agentConsole.privateSkill.delete.description", {
        name: skill.name || skill.key,
      }),
      okText: t("agentConsole.privateSkill.delete.confirm"),
      cancelText: t("agentConsole.privateSkill.delete.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingPrivateSkillKey(skill.key);
        setFormError("");
        try {
          const response = await deleteAdminAgentPrivateSkill({
            agentKey,
            key: skill.key,
          });
          const saved = response.data;
          setDetail(saved);
          setForm(formFromDetail(saved));
          setStructuredDirty(false);
          await loadAgents(agentKey);
          message.success(t("agentConsole.privateSkill.delete.success"));
        } catch (error) {
          const detail = (error as Error).message;
          setFormError(detail);
          message.error(detail);
          throw error;
        } finally {
          setDeletingPrivateSkillKey("");
        }
      },
    });
  };

  const confirmDelete = async () => {
    const key = form.key.trim();
    if (!key || formMode !== "edit") return;
    setDeleting(true);
    setError("");
    setFormError("");
    try {
      await deleteAgent({ key });
      const remaining = localAgents.filter(
        (agent) => toText(agent.key) !== key,
      );
      setLocalAgents(remaining);
      await refreshGlobalAgents();
      const nextKey = remaining[0]?.key || "";
      if (nextKey) commitAgentSelection(nextKey);
      else resetToCreate();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const setMode = (mode: string) => {
    if (mode === "PROXY" && !form.proxyConfigText.trim()) {
      updateForm({
        mode,
        proxyConfigText: JSON.stringify(
          {
            baseUrl: "",
            timeoutMs:
              editorOptions?.proxyConfigSchema?.defaultTimeoutMs || 300000,
          },
          null,
          2,
        ),
      });
      return;
    }
    updateForm({ mode });
  };

  const cancelEditing = useCallback(() => {
    if (
      hasUnsavedChanges &&
      !window.confirm(t("agentConsole.confirm.cancelEdit"))
    ) {
      return;
    }
    sourceLoadSeqRef.current += 1;
    if (detail) setForm(formFromDetail(detail));
    setEditorMode("structured");
    setInteractionMode("view");
    setIconEditorOpen(false);
    setSourceDraft("");
    setSourceSha256("");
    setSourcePath("");
    setSourceLoadedKey("");
    setSourceDirty(false);
    setStructuredDirty(false);
    setFormError("");
  }, [detail, hasUnsavedChanges, t]);

  const startEditing = useCallback(() => {
    setInteractionMode("edit");
    setFormError("");
  }, []);

  const applySourceResponse = (response: AdminSourceResponse) => {
    setSourceDraft(response.content);
    setSourceSha256(response.sha256);
    setSourcePath(response.source?.path || "");
    setSourceLoadedKey(response.target.key || "");
    setSourceDirty(false);
  };

  const toggleEditorMode = async () => {
    if (isReadOnly || !canEditSourceAgent) return;
    if (
      hasUnsavedChanges &&
      !window.confirm(t("agentConsole.confirm.switchEditor"))
    ) {
      return;
    }
    if (editorMode === "source") {
      setSourceDirty(false);
      setEditorMode("structured");
      return;
    }

    if (structuredDirty && detail) {
      setForm(formFromDetail(detail));
      setStructuredDirty(false);
    }
    setEditorMode("source");
    const key = form.key.trim();
    if (!key || sourceLoadedKey === key) return;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setLoadingSource(true);
    setFormError("");
    try {
      const response = await getAdminSource({ type: "agent", key });
      if (sourceLoadSeqRef.current !== requestSeq) return;
      applySourceResponse(response.data);
    } catch (error) {
      if (sourceLoadSeqRef.current !== requestSeq) return;
      setFormError((error as Error).message);
    } finally {
      if (sourceLoadSeqRef.current === requestSeq) {
        setLoadingSource(false);
      }
    }
  };

  const saveSource = async () => {
    const key = form.key.trim();
    if (!key || sourceLoadedKey !== key) return;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setSavingForm(true);
    setError("");
    setFormError("");
    try {
      const response = await updateAdminSource({
        target: { type: "agent", key },
        content: sourceDraft,
        baseSha256: sourceSha256 || undefined,
      });
      if (sourceLoadSeqRef.current === requestSeq) {
        applySourceResponse(response.data);
      }
      await loadAgents(key);
      await refreshGlobalAgents();
      const detailResponse = await getAdminAgentDetail(key);
      if (sourceLoadSeqRef.current === requestSeq) {
        const nextDetail = detailResponse.data as EditableAgentDetail;
        setDetail(nextDetail);
        setForm(formFromDetail(nextDetail));
        setFormMode("edit");
        setInteractionMode("edit");
        setStructuredDirty(false);
      }
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSavingForm(false);
    }
  };

  const sourceSaveDisabled =
    savingForm ||
    deleting ||
    loadingSource ||
    sourceLoadedKey !== form.key ||
    !sourceDirty;

  return (
    <div
      className={`${embedded ? "command-modal-section" : "management-page-console"} ${AGENT_CONSOLE_CLASS_NAME} ${embedded ? "is-embedded" : ""}`}
    >
      {embedded ? (
        <ModalTitleBar
          title={t("commandModal.agents.title")}
          variant={titleBarVariant}
          onClose={() => onClose?.()}
        />
      ) : null}
      <AgentCreateModal
        open={createModalOpen}
        t={t}
        onCancel={() => setCreateModalOpen(false)}
        onDirectCreate={startDirectCreate}
        onBeforeZipImport={confirmDiscardChanges}
        onZipImport={importAgentArchive}
        onImported={finishAgentArchiveImport}
      />
      <Modal
        open={privateSkillModalOpen}
        title={t("agentConsole.privateSkill.import.title")}
        width={560}
        destroyOnClose
        okText={t("agentConsole.privateSkill.import.submit")}
        cancelText={t("agentConsole.import.cancel")}
        confirmLoading={privateSkillImporting}
        okButtonProps={{
          disabled: !privateSkillFile,
        }}
        maskClosable={!privateSkillImporting}
        keyboard={!privateSkillImporting}
        onOk={() => void submitPrivateSkillImport()}
        onCancel={() => {
          if (privateSkillImporting) return;
          setPrivateSkillModalOpen(false);
          resetPrivateSkillImport();
        }}
      >
        <div className="tw:flex tw:flex-col tw:gap-4 tw:pt-1">
          <input
            ref={privateSkillFileInputRef}
            className="tw:hidden"
            type="file"
            accept=".zip,application/zip"
            aria-label={t("agentConsole.privateSkill.import.selectFile")}
            onChange={(event) => {
              selectPrivateSkillArchive(event.target.files?.[0] || null);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className={`tw:flex tw:min-h-36 tw:w-full tw:cursor-pointer tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-control tw:border tw:border-dashed tw:p-5 tw:text-center tw:transition-colors tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:cursor-not-allowed ${
              privateSkillDragActive
                ? "tw:border-accent tw:bg-accent-soft"
                : "tw:border-line-soft tw:bg-bg-subtle"
            }`}
            onClick={() => privateSkillFileInputRef.current?.click()}
            disabled={privateSkillImporting}
            onDragEnter={(event) => {
              event.preventDefault();
              setPrivateSkillDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setPrivateSkillDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setPrivateSkillDragActive(false);
              selectPrivateSkillArchive(event.dataTransfer.files?.[0] || null);
            }}
          >
            <MaterialIcon name="folder_zip" />
            {privateSkillFile ? (
              <>
                <strong className="tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-sm tw:text-ink-1">
                  {privateSkillFile.name}
                </strong>
                <span className="tw:text-xs tw:text-ink-muted">
                  {formatAgentArchiveSize(privateSkillFile.size)}
                </span>
              </>
            ) : (
              <>
                <span className="tw:text-sm tw:text-ink-1">
                  {t("agentConsole.privateSkill.import.drop")}
                </span>
                <span className="tw:max-w-lg tw:text-xs tw:leading-5 tw:text-ink-muted">
                  {t("agentConsole.privateSkill.import.description")}
                </span>
              </>
            )}
          </button>
          {privateSkillError && (
            <div className="tw:text-xs tw:text-danger">{privateSkillError}</div>
          )}
        </div>
      </Modal>
      {error && (
        <div className={AGENT_ERROR_CLASS_NAME}>
          <span>{error}</span>
          <UiButton size="sm" variant="ghost" onClick={() => loadAgents()}>
            {t("agentConsole.action.retry")}
          </UiButton>
        </div>
      )}

      <div className={AGENT_BODY_CLASS_NAME}>
        <AgentListPane
          agents={filteredAgents}
          selectedAgentKey={effectiveSelectedKey}
          draggingAgentKey={draggingAgentKey}
          loading={loadingList || savingForm || deleting}
          savingOrder={savingOrder}
          searchText={searchText}
          t={t}
          getSummary={(agent) => {
            const agentKey = toText(agent.key);
            return buildAgentListSummary(agent, agentKey === form.key ? form : undefined);
          }}
          getDiagnostic={firstAdminAgentDiagnosticMessage}
          isInvalid={isInvalidAdminAgent}
          onSearchTextChange={setSearchText}
          onRefresh={() => void loadAgents(effectiveSelectedKey)}
          onCreate={openCreateModal}
          onSelect={selectAgent}
          onDraggingAgentKeyChange={setDraggingAgentKey}
          onMove={handleMoveAgent}
        />

        <div
          ref={detailScrollRef}
          className={`${AGENT_DETAIL_CLASS_NAME} ${editorMode === "source" ? "is-source-editor" : ""}`}
        >
          <Spin spinning={loadingDetail || loadingSource}>
            <nav
              ref={sectionNavRef}
              className={AGENT_SECTION_NAV_CLASS_NAME}
              aria-label={t("agentConsole.sectionNav.ariaLabel")}
            >
              {shouldShowAgentSectionNav(
                editorMode,
                canEditStructuredAgent,
              ) && (
                <div className={AGENT_SECTION_NAV_LINKS_CLASS_NAME}>
                  {agentFormSections.map((section) => (
                    <a
                      className={`${AGENT_SECTION_NAV_LINK_CLASS_NAME} ${activeAgentSectionId === section.id ? "is-active" : ""}`}
                      href={`#${section.id}`}
                      key={section.id}
                      onClick={() => setActiveAgentSectionId(section.id)}
                    >
                      {section.label}
                    </a>
                  ))}
                </div>
              )}
              <div className={AGENT_SECTION_NAV_ACTIONS_CLASS_NAME}>
                {isReadOnly ? (
                  (canEditStructuredAgent || Boolean(detailSourcePath)) && (
                    <>
                      <UiButton
                        size="sm"
                        variant="primary"
                        onClick={startEditing}
                      >
                        <MaterialIcon name="edit" />
                        <span>{t("agentConsole.action.edit")}</span>
                      </UiButton>
                    </>
                  )
                ) : (
                  <>
                    {canEditSourceAgent && (
                      <Tooltip
                        title={
                        editorMode === "source"
                          ? t("agentConsole.action.structuredEdit")
                          : t("agentConsole.action.sourceEdit")
                        }
                        arrow={false}
                      >
                        <UiButton
                          className={AGENT_SECTION_NAV_ICON_BUTTON_CLASS_NAME}
                          size="sm"
                          variant="ghost"
                          iconOnly
                          active={editorMode === "source"}
                          onClick={() => {
                            void toggleEditorMode();
                          }}
                          disabled={savingForm || deleting || loadingSource}
                          loading={loadingSource}
                          aria-label={
                            editorMode === "source"
                              ? t("agentConsole.action.structuredEdit")
                              : t("agentConsole.action.sourceEdit")
                          }
                        >
                          <MaterialIcon
                            name={editorMode === "source" ? "tune" : "code"}
                          />
                        </UiButton>
                      </Tooltip>
                    )}
                    {formMode === "edit" && (
                      <Popconfirm
                        title={t("agentConsole.confirm.deleteTitle")}
                        okText={t("agentConsole.confirm.deleteOk")}
                        cancelText={t("agentConsole.confirm.deleteCancel")}
                        okButtonProps={{ danger: true }}
                        onConfirm={confirmDelete}
                        disabled={deleting}
                      >
                        <UiButton
                          className={`${AGENT_SECTION_NAV_ICON_BUTTON_CLASS_NAME} tw:!text-danger`}
                          size="sm"
                          variant="ghost"
                          iconOnly
                          disabled={deleting || savingForm}
                          loading={deleting}
                          aria-label={t("agentConsole.action.delete")}
                        >
                          <MaterialIcon name="delete" />
                        </UiButton>
                      </Popconfirm>
                    )}
                    {formMode === "edit" && (
                      <UiButton
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditing}
                        disabled={savingForm || deleting}
                      >
                        {t("agentConsole.action.cancelEdit")}
                      </UiButton>
                    )}
                    <UiButton
                      className={AGENT_SECTION_NAV_SAVE_CLASS_NAME}
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        if (editorMode === "source") {
                          void saveSource();
                        } else {
                          void saveForm();
                        }
                      }}
                      disabled={
                        editorMode === "source"
                          ? sourceSaveDisabled
                          : !canEditStructuredAgent || deleting
                      }
                      loading={savingForm}
                    >
                      <MaterialIcon name="save" />
                      <span>
                        {formMode === "create"
                          ? t("agentConsole.action.create")
                          : editorMode === "source"
                            ? t("agentConsole.action.saveSource")
                            : t("agentConsole.action.saveChanges")}
                      </span>
                    </UiButton>
                  </>
                )}
              </div>
            </nav>

            {formMode === "edit" && detailDiagnostics.length > 0 && (
              <div className={AGENT_DETAIL_ADMIN_META_CLASS_NAME}>
                <div className={AGENT_DIAGNOSTICS_CLASS_NAME} role="status">
                  <strong>{t("agentConsole.diagnostics.title")}</strong>
                  {detailDiagnostics.map((diagnostic, index) => (
                    <div
                      className={AGENT_DIAGNOSTIC_ITEM_CLASS_NAME}
                      key={`${diagnostic.code}-${index}`}
                    >
                      <span className={AGENT_DIAGNOSTIC_CODE_CLASS_NAME}>
                        {[diagnostic.severity, diagnostic.code]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span>{diagnostic.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editorMode === "source" ? (
              sourceLoadedKey === form.key ? (
                <AgentSourceEditor
                  value={sourceDraft}
                  dirty={sourceDirty}
                  error={formError}
                  t={t}
                  onChange={(value) => {
                    setSourceDraft(value);
                    setSourceDirty(true);
                    setFormError("");
                  }}
                />
              ) : null
            ) : canEditStructuredAgent ? (
              <AgentEditor readOnly={isReadOnly}>
                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[0]}
                  icon="person"
                  title={t("agentConsole.basic.identityTitle")}
                >
                  <div className="agent-basic-identity">
                    <div className="agent-identity-avatar-column">
                      <div className="agent-icon-picker">
                        <div className="agent-identity-avatar" aria-hidden="true">
                          <AgentIcon
                            icon={selectedIconValue as any}
                            type="agent"
                            props={{
                              icon: { width: 80, height: 80 },
                              avatar: {
                                size: 80,
                                icon: <MaterialIcon name="smart_toy" />,
                              },
                            }}
                          />
                        </div>
                        <Popover
                          open={iconEditorOpen}
                          onOpenChange={setIconEditorOpen}
                          trigger="click"
                          placement="bottom"
                          arrow={false}
                          destroyOnHidden
                          classNames={{ root: "agent-icon-editor-popover" }}
                          content={
                            <div
                              id="agent-icon-editor"
                              className="agent-icon-editor-panel"
                            >
                              <div className="field-group">
                                <label htmlFor="agent-icon-kind-input">
                                  {t("agentConsole.field.icon")}
                                </label>
                                <Select
                                  id="agent-icon-kind-input"
                                  value={form.iconKind}
                                  options={[
                                    {
                                      value: "none",
                                      label: t("agentConsole.field.iconKind.none"),
                                    },
                                    {
                                      value: "builtin",
                                      label: t("agentConsole.field.iconKind.builtin"),
                                    },
                                    {
                                      value: "image",
                                      label: t("agentConsole.field.iconKind.image"),
                                    },
                                  ]}
                                  onChange={(value: IconKind) =>
                                    updateForm({ iconKind: value })
                                  }
                                />
                              </div>
                              {form.iconKind === "builtin" && (
                                <div className="field-group">
                                  <label htmlFor="agent-icon-name-input">
                                    {t("agentConsole.field.iconName")}
                                  </label>
                                  <Select
                                    id="agent-icon-name-input"
                                    showSearch
                                    allowClear
                                    value={form.iconName || undefined}
                                    options={AGENT_ICON_NAMES.map((name) => ({
                                      value: name,
                                      label: name,
                                    }))}
                                    onChange={(value) =>
                                      updateForm({ iconName: value || "" })
                                    }
                                  />
                                </div>
                              )}
                              {form.iconKind === "image" && (
                                <div className="field-group">
                                  <label htmlFor="agent-icon-image-input">
                                    {t("agentConsole.field.iconImage")}
                                  </label>
                                  <Input
                                    id="agent-icon-image-input"
                                    placeholder={t("agentConsole.placeholder.iconImage")}
                                    value={form.iconImage}
                                    onChange={(event) =>
                                      updateForm({ iconImage: event.target.value })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          }
                        >
                          <UiButton
                            size="sm"
                            variant="ghost"
                            className="agent-icon-picker-action"
                            aria-expanded={iconEditorOpen}
                            aria-controls="agent-icon-editor"
                          >
                            <MaterialIcon name="image" />
                            {t("agentConsole.basic.changeIcon")}
                          </UiButton>
                        </Popover>
                      </div>
                    </div>
                    <div className="agent-identity-fields">
                      <div className="field-group">
                        <label htmlFor="agent-name-input">
                          {t("agentConsole.field.name")}
                        </label>
                        <Input
                          id="agent-name-input"
                          value={form.name}
                          onChange={(event) =>
                            updateForm({ name: event.target.value })
                          }
                        />
                      </div>
                      <div className="field-group">
                        <label htmlFor="agent-role-input">
                          {t("agentConsole.field.role")}
                        </label>
                        <Input
                          id="agent-role-input"
                          value={form.role}
                          onChange={(event) =>
                            updateForm({ role: event.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="field-group agent-identity-description">
                      <label htmlFor="agent-description-input">
                        {t("agentConsole.field.description")}
                      </label>
                      <Input.TextArea
                        id="agent-description-input"
                        className="agent-description-textarea"
                        rows={4}
                        value={form.description}
                        onChange={(event) =>
                          updateForm({ description: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="agent-basic-runtime">
                    <div className="agent-subsection-heading">
                      <MaterialIcon name="play_circle" />
                      <h3>{t("agentConsole.basic.runtimeTitle")}</h3>
                    </div>
                    <div className="field-group">
                      <span id="agent-mode-label" className="field-label">
                        {t("agentConsole.field.mode")}
                      </span>
                      <div
                        id="agent-mode-options"
                        className="agent-choice-grid agent-mode-choice-grid"
                        role="radiogroup"
                        aria-labelledby="agent-mode-label"
                      >
                        {modeOptions.map((option) => {
                          const presentation = modePresentation(option.value, option.label, t);
                          return <label
                            key={option.value}
                            className={`agent-choice-card ${form.mode === option.value ? "is-selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="agent-mode"
                              value={option.value}
                              checked={form.mode === option.value}
                              onChange={() => setMode(option.value)}
                            />
                            <MaterialIcon name={presentation.icon} />
                            <span className="agent-choice-card-copy">
                              <span className="agent-choice-card-title">{presentation.label}</span>
                              <span className="agent-choice-card-description">{presentation.description}</span>
                            </span>
                          </label>
                        })}
                      </div>
                    </div>
                    <div className="field-group">
                      <span id="agent-visibility-label" className="field-label">
                        {t("agentConsole.field.visibility")}
                      </span>
                      <div
                        id="agent-visibility-options"
                        className="agent-choice-grid agent-visibility-choice-grid"
                        role="group"
                        aria-labelledby="agent-visibility-label"
                        aria-busy={loadingOptions}
                      >
                        {visibilityScopeOptions.map((option) => {
                          const checked = form.visibilityScopes.includes(
                            option.value,
                          );
                          const presentation = visibilityPresentation(option.value, option.label, t);
                          return (
                            <label
                              key={option.value}
                              className={`agent-choice-card ${checked ? "is-selected" : ""}`}
                            >
                              <input
                                type="checkbox"
                                value={option.value}
                                checked={checked}
                                onChange={() =>
                                  updateForm({
                                    visibilityScopes: checked
                                      ? form.visibilityScopes.filter(
                                          (scope) => scope !== option.value,
                                        )
                                      : [...form.visibilityScopes, option.value],
                                  })
                                }
                              />
                              <MaterialIcon name={presentation.icon} />
                              <span className="agent-choice-card-copy">
                                <span className="agent-choice-card-title">{presentation.label}</span>
                                <span className="agent-choice-card-description">{presentation.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </AgentFormSection>


                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[2]}
                  icon="subject"
                  title={t("agentConsole.section.prompts")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <label htmlFor="agent-soul-input">
                          {t("agentConsole.prompt.soul.label")}
                          <span>SOUL.md</span>
                        </label>
                        <Tooltip title={t("agentConsole.prompt.soul.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.soul.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                      </div>
                      <Input.TextArea
                        id="agent-soul-input"
                        className={AGENT_PROMPT_TEXTAREA_CLASS_NAME}
                        rows={10}
                        value={form.soulPrompt}
                        onChange={(event) => updateForm({ soulPrompt: event.target.value })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <label htmlFor="agent-agents-input">
                          {t("agentConsole.prompt.agents.label")}
                          <span>AGENTS.md</span>
                        </label>
                        <Tooltip title={t("agentConsole.prompt.agents.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.agents.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                      </div>
                      <Input.TextArea
                        id="agent-agents-input"
                        className={AGENT_PROMPT_TEXTAREA_CLASS_NAME}
                        rows={10}
                        value={form.agentsPrompt}
                        onChange={(event) => updateForm({ agentsPrompt: event.target.value })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <span id="agent-greetings-label" className="agent-prompt-field-label">{t("agentConsole.field.greetings")}</span>
                        <Tooltip title={t("agentConsole.prompt.greetings.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.greetings.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                        {!isReadOnly && <UiButton className="agent-prompt-heading-action" size="sm" variant="ghost" onClick={() => updateForm({ greetingsText: promptEntriesToJson([...greetingEntries, ""]) })}><MaterialIcon name="add" />{t("agentConsole.prompt.addGreeting")}</UiButton>}
                      </div>
                      <div className="agent-prompt-entry-list" role="group" aria-labelledby="agent-greetings-label">
                        {(greetingEntries.length ? greetingEntries : [""]).map((entry, index) => (
                          <div className="agent-prompt-entry" key={`greeting-${index}`}>
                            <Input
                              id={index === 0 ? "agent-greetings-input" : undefined}
                              aria-label={t("agentConsole.prompt.greetings.item", { index: index + 1 })}
                              placeholder={t("agentConsole.prompt.greetings.placeholder")}
                              value={entry}
                              onChange={(event) => {
                                const next = [...(greetingEntries.length ? greetingEntries : [""])];
                                next[index] = event.target.value;
                                updateForm({ greetingsText: promptEntriesToJson(next) });
                              }}
                            />
                            {!isReadOnly && <UiButton size="mini" variant="ghost" aria-label={t("agentConsole.prompt.removeItem", { index: index + 1 })} onClick={() => updateForm({ greetingsText: promptEntriesToJson(greetingEntries.filter((_, entryIndex) => entryIndex !== index)) })}><MaterialIcon name="delete" /></UiButton>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <span id="agent-wonders-label" className="agent-prompt-field-label">{t("agentConsole.field.wonders")}</span>
                        <Tooltip title={t("agentConsole.prompt.wonders.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.wonders.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                        {!isReadOnly && <UiButton className="agent-prompt-heading-action" size="sm" variant="ghost" onClick={() => updateForm({ wondersText: promptEntriesToJson([...wonderEntries, ""]) })}><MaterialIcon name="add" />{t("agentConsole.prompt.addWonder")}</UiButton>}
                      </div>
                      <div className="agent-prompt-entry-list" role="group" aria-labelledby="agent-wonders-label">
                        {(wonderEntries.length ? wonderEntries : [""]).map((entry, index) => (
                          <div className="agent-prompt-entry" key={`wonder-${index}`}>
                            <Input
                              id={index === 0 ? "agent-wonders-input" : undefined}
                              aria-label={t("agentConsole.prompt.wonders.item", { index: index + 1 })}
                              placeholder={t("agentConsole.prompt.wonders.placeholder")}
                              value={entry}
                              onChange={(event) => {
                                const next = [...(wonderEntries.length ? wonderEntries : [""])];
                                next[index] = event.target.value;
                                updateForm({ wondersText: promptEntriesToJson(next) });
                              }}
                            />
                            {!isReadOnly && <UiButton size="mini" variant="ghost" aria-label={t("agentConsole.prompt.removeItem", { index: index + 1 })} onClick={() => updateForm({ wondersText: promptEntriesToJson(wonderEntries.filter((_, entryIndex) => entryIndex !== index)) })}><MaterialIcon name="delete" /></UiButton>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </AgentFormSection>
                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[1]}
                  icon="psychology"
                  title={t("agentConsole.section.model")}
                >
                  <div className="agent-model-selector-card">
                    <div className="agent-model-dropdown">
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
                          className={`query-settings-btn tw:!min-h-8 tw:!rounded-lg tw:!px-2 tw:!text-[13px] tw:text-text-muted tw:[&_.material-icon]:flex-none tw:[&_.material-icon]:text-sm tw:[&_.ui-btn-label]:inline-flex tw:[&_.ui-btn-label]:min-w-0 tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-1 tw:[&_.ui-btn-label>span:not(.material-icon)]:min-w-0 tw:[&_.ui-btn-label>span:not(.material-icon)]:overflow-hidden tw:[&_.ui-btn-label>span:not(.material-icon)]:text-ellipsis tw:[&_.ui-btn-label>span:not(.material-icon)]:whitespace-nowrap query-model-btn tw:overflow-hidden ${queryModelButtonStateClass}`.trim()}
                          variant="ghost"
                          size="sm"
                          disabled={isReadOnly || loadingOptions}
                          title={formError || t("composer.query.model.title")}
                          onClick={(event) => event.preventDefault()}
                        >
                          {showFastBadge ? <MaterialIcon name="bolt" /> : null}
                          <span className="query-model-label tw:text-text-main">
                            {selectedModelLabel}
                          </span>
                          <span>{selectedReasoningLabel}</span>
                          <MaterialIcon name="expand_more" />
                        </UiButton>
                      </Dropdown>
                    </div>
                  </div>
                </AgentFormSection>

                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[3]}
                  icon="hub"
                  title={t("agentConsole.section.capabilities")}
                >
                  <AgentCapabilitiesEditor
                    readOnly={isReadOnly}
                    contextOptions={contextTagOptions.map((option) => {
                      const presentation = contextOptionPresentation(option.value);
                      return {
                        value: option.value,
                        label: option.label,
                        icon: presentation.icon,
                        description: t(presentation.descriptionKey),
                      };
                    })}
                    contextTags={form.contextTags}
                    tools={form.tools}
                    skills={form.skills}
                    filteredTools={filteredToolOptions}
                    selectedTools={selectedTools}
                    filteredSkills={filteredSkillOptions}
                    selectedSkills={selectedSkills}
                    toolFilter={toolFilter}
                    toolSearchText={toolSearchText}
                    skillSearchText={skillSearchText}
                    toolsExpanded={toolsExpanded}
                    skillsExpanded={skillsExpanded}
                    canImportPrivateSkill={canImportPrivateSkill}
                    t={t}
                    getToolCategory={toolFilterForOption}
                    getToolSourceLabel={(tool) => toolSourceLabel(tool.sourceCategory, t) || tool.kind}
                    onContextTagsChange={(contextTags) => updateForm({ contextTags })}
                    onToolsChange={(tools) => updateForm({ tools })}
                    onSkillsChange={(skills) => updateForm({ skills })}
                    onToolFilterChange={setToolFilter}
                    onToolSearchTextChange={setToolSearchText}
                    onSkillSearchTextChange={setSkillSearchText}
                    onToolsExpandedChange={setToolsExpanded}
                    onSkillsExpandedChange={setSkillsExpanded}
                    onImportPrivateSkill={openPrivateSkillImport}
                  />
                </AgentFormSection>

                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[4]}
                  icon="tune"
                  title={t("agentConsole.section.advancedConfig")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-controls-input">
                        {t("agentConsole.field.controls")}
                      </label>
                      <Input.TextArea
                        id="agent-controls-input"
                        className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                        rows={5}
                        value={form.controlsText}
                        onChange={(event) =>
                          updateForm({ controlsText: event.target.value })
                        }
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-runtime-input">
                        {t("agentConsole.field.runtimeConfig")}
                      </label>
                      <Input.TextArea
                        id="agent-runtime-input"
                        className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                        rows={5}
                        placeholder='{"environmentId":"shell","level":"RUN"}'
                        value={form.runtimeConfigText}
                        onChange={(event) =>
                          updateForm({ runtimeConfigText: event.target.value })
                        }
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-advanced-field-heading">
                        <label htmlFor="agent-budget-input">
                          {t("agentConsole.field.budget")}
                        </label>
                        {!isReadOnly && (
                          <Dropdown
                            menu={{
                              items: [
                                {
                                  key: "simple",
                                  label: t("agentConsole.budget.template.simple"),
                                },
                                {
                                  key: "advanced",
                                  label: t("agentConsole.budget.template.advanced"),
                                },
                              ],
                              onClick: ({ key }) =>
                                updateForm({
                                  budgetText:
                                    key === "simple"
                                      ? SIMPLE_BUDGET_TEMPLATE
                                      : BUDGET_PLACEHOLDER,
                                }),
                            }}
                            placement="bottomRight"
                            trigger={["click"]}
                          >
                            <UiButton
                              className="agent-budget-template-trigger"
                              size="mini"
                              variant="ghost"
                            >
                              <MaterialIcon name="content_copy" />
                              <span>{t("agentConsole.budget.template")}</span>
                              <MaterialIcon name="expand_more" />
                            </UiButton>
                          </Dropdown>
                        )}
                      </div>
                      <Input.TextArea
                        id="agent-budget-input"
                        className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                        rows={7}
                        placeholder={BUDGET_PLACEHOLDER}
                        value={form.budgetText}
                        onChange={(event) =>
                          updateForm({ budgetText: event.target.value })
                        }
                      />
                    </div>
                    {form.mode === "PROXY" && (
                      <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                        <label htmlFor="agent-proxy-input">
                          {t("agentConsole.field.acpProxyConfig")}
                        </label>
                        <Input.TextArea
                          id="agent-proxy-input"
                          className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                          rows={5}
                          placeholder='{"baseUrl":"http://127.0.0.1:3210","timeoutMs":300000}'
                          value={form.proxyConfigText}
                          onChange={(event) =>
                            updateForm({ proxyConfigText: event.target.value })
                          }
                        />
                      </div>
                    )}
                  </div>
                </AgentFormSection>
              </AgentEditor>
            ) : (
              <div className={AGENT_UNEDITABLE_CLASS_NAME}>
                <MaterialIcon name="warning" />
                <span>{t("agentConsole.diagnostics.uneditable")}</span>
              </div>
            )}

            {editorMode !== "source" && (
              formError && <div className="settings-error">{formError}</div>
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
};

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox, Input, Modal, Popconfirm, Select, Spin, Switch, message } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/app/state/types";
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
  importAdminAgentPrivateSkill,
  putAdminAgentOrder,
  updateAgent,
  updateAdminSource,
} from "@/shared/data";
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
} from "@/shared/data";
import {
  agentOrderPayload,
  filterAgentsPreservingOrder,
  moveAgentForDrop,
} from "@/features/workers/lib/agentOrdering";
import { AGENT_ICON_NAMES, AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n, type I18nContextValue } from "@/shared/i18n";
import { openRegisteredAgentDirectory } from "@/shared/data/desktop/desktopFileSystem";

type AgentFormMode = "create" | "edit";
type AgentEditorMode = "structured" | "source";
type IconKind = "none" | "builtin" | "image";
type Translate = I18nContextValue["t"];
type EditableAgentDetail = AgentDetailResponse | AdminAgentDetailResponse;
export type AgentToolOption = {
  key: string;
  label: string;
  sourceCategory: string;
  kind: string;
};

type AgentSkillOption = {
  key: string;
  label: string;
  source: "center" | "private";
  overridesCenter?: boolean;
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
  reasoningConfigured: boolean;
  reasoningEnabled: boolean;
  reasoningEffort: string;
  tools: string[];
  skills: string[];
  greetings: string[];
  wonders: string[];
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

interface AgentConsoleProps {
  selectedAgentKey?: string;
  onSelectAgentKey?: (agentKey: string) => void;
  onClearSelection?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  embedded?: boolean;
}

export const AGENT_CONSOLE_ADMIN_LIST_ROUTE = dataEndpoints.adminAgents.path;

export function shouldShowAgentDirectoryButton(
  formMode: AgentFormMode,
  sourcePath: string,
): boolean {
  return formMode === "edit" && Boolean(sourcePath.trim());
}

export function buildAgentConfigDirectoryOpenOptions(
  agentKey: string,
): { agentKey: string; directoryType: "config" } | null {
  const normalizedAgentKey = agentKey.trim();
  return normalizedAgentKey
    ? { agentKey: normalizedAgentKey, directoryType: "config" }
    : null;
}

export function shouldShowAgentSectionNav(
  editorMode: AgentEditorMode,
  canEditStructuredAgent: boolean,
): boolean {
  return editorMode === "structured" && canEditStructuredAgent;
}

export function resolveAgentSavePlacement(
  formMode: AgentFormMode,
  editorMode: AgentEditorMode,
  canEditStructuredAgent: boolean,
) {
  const sticky =
    formMode === "edit" &&
    shouldShowAgentSectionNav(editorMode, canEditStructuredAgent);
  return {
    header: formMode === "edit" && !sticky,
    sticky,
    footer: formMode === "create" && editorMode === "structured",
  };
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
  reasoningConfigured: false,
  reasoningEnabled: false,
  reasoningEffort: "",
  tools: [],
  skills: [],
  greetings: [],
  wonders: [],
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

const BUDGET_PLACEHOLDER = `{
  "runTimeoutMs": 600000,
  "maxSteps": 240,
  "model": { "maxCalls": 240 },
  "tool": { "maxCalls": 200 }
}`;
const DEFAULT_REASONING_EFFORTS = ["LOW", "MEDIUM", "HIGH"];

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeReasoningEffort(value: unknown): string {
  return toText(value).toUpperCase();
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
  if (!detail || !Array.isArray((detail as AdminAgentDetailResponse).privateSkills)) {
    return [];
  }
  return (detail as AdminAgentDetailResponse).privateSkills || [];
}

export function mergeAgentSkillOptions(
  centerSkills: Array<{ key: string; label: string }>,
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
      label: `${item.label}${item.label === item.key ? "" : ` · ${item.key}`} · ${
        item.source === "private"
          ? item.overridesCenter
            ? t("agentConsole.privateSkill.source.override")
            : t("agentConsole.privateSkill.source.private")
          : t("agentConsole.privateSkill.source.center")
      }`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function textListFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];
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
    greetings: textListFromUnknown(definition.greetings || detail.greetings),
    wonders: textListFromUnknown(definition.wonders || detail.wonders),
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

  const greetings = form.greetings.map((item) => item.trim()).filter(Boolean);
  if (greetings.length > 0) definition.greetings = greetings;
  else delete definition.greetings;

  const wonders = form.wonders.map((item) => item.trim()).filter(Boolean);
  if (wonders.length > 0) definition.wonders = wonders;
  else delete definition.wonders;

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

function normalizeModeKey(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === "PLAN-EXECUTE" || upper === "PLAN_EXECUTE")
    return "PLAN_EXECUTE";
  if (upper === "ACP-PROXY" || upper === "ACP_PROXY" || upper === "PROXY")
    return "PROXY";
  return upper;
}

const MODE_LABEL: Record<string, string> = {
  REACT: "REACT",
  CODER: "CODER",
  PLAN_EXECUTE: "P-E",
  PROXY: "PROXY",
};
const AGENT_CONSOLE_CLASS_NAME = "agent-console tw:overflow-hidden";
const AGENT_ERROR_CLASS_NAME =
  "agent-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const AGENT_BODY_CLASS_NAME =
  "agent-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[minmax(280px,0.52fr)_minmax(480px,1.55fr)] tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const AGENT_LIST_CLASS_NAME =
  "agent-console-list tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[260px]";
const AGENT_TOOLBAR_CLASS_NAME =
  "agent-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2 tw:max-[860px]:grid-cols-[1fr_auto_auto] tw:max-[860px]:[&_.ant-input-affix-wrapper]:col-span-full";
const AGENT_COUNT_CLASS_NAME =
  "agent-console-count tw:flex tw:items-center tw:justify-between tw:gap-2 tw:text-xs tw:text-ink-muted";
const AGENT_LIST_SCROLL_CLASS_NAME =
  "agent-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto tw:pr-0.5";
const AGENT_LIST_ITEMS_CLASS_NAME =
  "agent-console-list-items tw:flex tw:flex-col tw:gap-1.5";
const AGENT_LIST_ITEM_CLASS_NAME =
  "agent-console-list-item tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-[color-mix(in_srgb,var(--accent-electric)_68%,transparent)] tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover tw:[&.is-dragging]:opacity-[0.55] tw:[&.is-invalid]:[border-color:color-mix(in_srgb,var(--accent-danger)_34%,transparent)] tw:[&.is-invalid]:bg-[color-mix(in_srgb,var(--accent-danger)_7%,transparent)]";
const AGENT_LIST_ITEM_ICON_COL_CLASS_NAME =
  "agent-console-list-item-icon-col tw:flex tw:flex-none tw:flex-col tw:items-center tw:gap-[3px]";
const AGENT_LIST_ITEM_ICON_CLASS_NAME =
  "agent-console-list-item-icon tw:inline-flex tw:h-8 tw:w-8 tw:flex-none tw:items-center tw:justify-center tw:overflow-hidden tw:rounded-lg tw:bg-[color-mix(in_srgb,var(--accent-soft)_22%,var(--bg-input))] tw:text-accent-electric tw:[&.is-drag-handle]:cursor-grab tw:[&.is-drag-handle:active]:cursor-grabbing";
const AGENT_LIST_ITEM_SVG_CLASS_NAME = "agent-console-list-item-svg tw:block";
const AGENT_LIST_ITEM_MAIN_CLASS_NAME =
  "agent-console-list-item-main tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1";
const AGENT_LIST_ITEM_ROW_CLASS_NAME =
  "agent-console-list-item-row tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:[&>span]:min-w-0 tw:[&>span]:overflow-hidden tw:[&>span]:text-ellipsis tw:[&>span]:whitespace-nowrap";
const AGENT_LIST_ITEM_HEAD_CLASS_NAME = `${AGENT_LIST_ITEM_ROW_CLASS_NAME} agent-console-list-item-head tw:text-ink-1 tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:whitespace-nowrap tw:[&>strong]:text-[13px]`;
const AGENT_LIST_ITEM_HEAD_META_CLASS_NAME =
  "agent-console-list-item-head-meta tw:inline-flex tw:min-w-0 tw:items-center tw:justify-end tw:gap-1.5 tw:[&>span]:flex-[0_1_auto] tw:[&>span]:text-xs tw:[&>span]:font-semibold tw:[&>span]:text-ink-muted";
const AGENT_STATUS_INVALID_CLASS_NAME =
  "agent-console-status is-invalid tw:flex-none tw:rounded-pill tw:bg-[color-mix(in_srgb,var(--accent-danger)_14%,var(--bg-input))] tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:font-bold tw:leading-[1.2] tw:text-accent-danger";
const AGENT_LIST_ITEM_META_CLASS_NAME = `${AGENT_LIST_ITEM_ROW_CLASS_NAME} agent-console-list-item-meta tw:text-[11px] tw:text-ink-muted tw:[&>span]:text-[11px] tw:[&>span]:font-medium tw:[&>span]:text-ink-muted`;
const AGENT_LIST_ITEM_COUNTS_CLASS_NAME =
  "agent-console-list-item-counts tw:inline-flex tw:items-center tw:gap-0.5";
const AGENT_LIST_ITEM_COUNT_CLASS_NAME =
  "agent-console-list-item-count tw:inline-flex tw:items-center tw:gap-px tw:text-[9px]";
const AGENT_LIST_ITEM_COUNT_ICON_CLASS_NAME =
  "agent-console-list-item-count-icon tw:h-[9px] tw:w-[9px]";
const AGENT_LIST_ITEM_COUNT_SEP_CLASS_NAME =
  "agent-console-list-item-count-sep tw:text-[8px] tw:text-ink-muted tw:opacity-60";
const AGENT_LIST_ITEM_MODE_BADGE_CLASS_NAME =
  "agent-console-list-item-mode-badge tw:inline-flex tw:items-center tw:justify-center tw:gap-0.5 tw:text-ink-muted tw:[&_span]:text-[10px] tw:[&_span]:font-semibold tw:[&_span]:tracking-[0.04em] tw:[&_svg]:h-2 tw:[&_svg]:w-2";
const AGENT_LIST_ITEM_DIAGNOSTIC_CLASS_NAME =
  "agent-console-list-item-diagnostic tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:font-medium tw:text-accent-danger";
const AGENT_DETAIL_CLASS_NAME =
  "agent-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto tw:[&_.ant-select]:min-w-0 tw:[&_.ant-select]:w-full tw:[&_select]:min-h-8 tw:[&_select]:w-full tw:[&_select]:rounded-control tw:[&_select]:border tw:[&_select]:px-2 tw:[&_select]:py-1.5 tw:[&_select]:text-xs tw:[&_select]:text-ink-1 tw:[&_select]:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:[&_select]:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))]";
const AGENT_DETAIL_HEAD_CLASS_NAME =
  "agent-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px]";
const AGENT_DETAIL_PATH_ROW_CLASS_NAME =
  "agent-detail-path-row tw:flex tw:min-w-0 tw:items-center tw:gap-1";
const AGENT_DETAIL_ACTIONS_CLASS_NAME =
  "agent-detail-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const AGENT_DETAIL_ADMIN_META_CLASS_NAME =
  "agent-detail-admin-meta tw:mb-3.5 tw:flex tw:flex-col tw:gap-2";
const AGENT_DIAGNOSTICS_CLASS_NAME =
  "agent-diagnostics tw:flex tw:flex-col tw:gap-1.5 tw:rounded-control tw:border tw:p-2.5 tw:text-xs tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--accent-danger)_26%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_6%,transparent)] tw:[&>strong]:font-bold tw:[&>strong]:text-accent-danger";
const AGENT_DIAGNOSTIC_ITEM_CLASS_NAME =
  "agent-diagnostic-item tw:flex tw:min-w-0 tw:flex-col tw:gap-[3px]";
const AGENT_DIAGNOSTIC_CODE_CLASS_NAME =
  "agent-diagnostic-code tw:text-[11px] tw:font-bold tw:text-ink-muted";
const AGENT_FORM_GRID_CLASS_NAME =
  "agent-form-grid tw:grid tw:grid-cols-3 tw:gap-3 tw:max-[860px]:grid-cols-1 tw:[&_.field-group]:mb-0";
const AGENT_FORM_FULL_WIDTH_CLASS_NAME =
  "field-group agent-form-full-width tw:col-span-3 tw:max-[860px]:col-span-1";
const AGENT_SECTION_NAV_CLASS_NAME =
  "agent-section-nav tw:sticky tw:top-0 tw:flex tw:items-center";
const AGENT_SECTION_NAV_LINKS_CLASS_NAME =
  "agent-section-nav-links tw:flex tw:min-w-0 tw:flex-1 tw:overflow-x-auto";
const AGENT_SECTION_NAV_LINK_CLASS_NAME =
  "agent-section-nav-link tw:flex-none tw:whitespace-nowrap";
const AGENT_SECTION_NAV_SAVE_CLASS_NAME =
  "agent-section-nav-save tw:ml-auto tw:flex-none";
const AGENT_FORM_SECTION_CLASS_NAME = "agent-form-section";
const AGENT_FORM_SECTION_HEADING_CLASS_NAME =
  "agent-form-section-heading tw:flex tw:items-center tw:gap-1.5";
const AGENT_ICON_EDITOR_CLASS_NAME =
  "agent-icon-editor tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-2";
const AGENT_ICON_PREVIEW_CLASS_NAME =
  "agent-icon-preview tw:inline-flex tw:h-8 tw:w-8 tw:items-center tw:justify-center tw:overflow-hidden";
const AGENT_STRING_LIST_EDITOR_CLASS_NAME =
  "agent-string-list-editor tw:flex tw:flex-col tw:gap-2";
const AGENT_STRING_LIST_ROW_CLASS_NAME =
  "agent-string-list-row tw:grid tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-2";
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
  "agent-section-context-capabilities",
  "agent-section-advanced",
  "agent-section-prompts",
] as const;

export type AgentFormSectionId = (typeof AGENT_FORM_SECTION_IDS)[number];

export function resolveActiveAgentFormSection(
  sectionTops: number[],
  activationLine: number,
  atBottom: boolean,
): AgentFormSectionId {
  if (atBottom) {
    return AGENT_FORM_SECTION_IDS[AGENT_FORM_SECTION_IDS.length - 1];
  }

  let activeSection: AgentFormSectionId = AGENT_FORM_SECTION_IDS[0];
  AGENT_FORM_SECTION_IDS.forEach((sectionId, index) => {
    if (sectionTops[index] <= activationLine) {
      activeSection = sectionId;
    }
  });
  return activeSection;
}

interface AgentFormSectionProps {
  active?: boolean;
  children: React.ReactNode;
  icon: MaterialIconName;
  id: AgentFormSectionId;
  title: string;
}

const AgentFormSection: React.FC<AgentFormSectionProps> = ({
  active = false,
  children,
  icon,
  id,
  title,
}) => {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className={`${AGENT_FORM_SECTION_CLASS_NAME} ${active ? "is-active" : ""}`}
      aria-labelledby={titleId}
    >
      <div className={AGENT_FORM_SECTION_HEADING_CLASS_NAME}>
        <MaterialIcon name={icon} />
        <h3 id={titleId}>{title}</h3>
      </div>
      {children}
    </section>
  );
};

interface AgentStringListEditorProps {
  addLabel: string;
  removeLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
}

const AgentStringListEditor: React.FC<AgentStringListEditorProps> = ({
  addLabel,
  removeLabel,
  values,
  onChange,
}) => {
  const rows = values.length > 0 ? values : [""];
  return (
    <div className={AGENT_STRING_LIST_EDITOR_CLASS_NAME}>
      {rows.map((value, index) => (
        <div className={AGENT_STRING_LIST_ROW_CLASS_NAME} key={index}>
          <Input
            value={value}
            onChange={(event) => {
              const next = values.length > 0 ? [...values] : [""];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          <UiButton
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={removeLabel}
            onClick={() =>
              onChange(values.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <MaterialIcon name="close" />
          </UiButton>
        </div>
      ))}
      <UiButton
        size="sm"
        variant="ghost"
        onClick={() => onChange([...values, ""])}
      >
        <MaterialIcon name="add" />
        <span>{addLabel}</span>
      </UiButton>
    </div>
  );
};

const ModeBadge: React.FC<{ mode: string }> = ({ mode }) => {
  const normalized = normalizeModeKey(mode);
  const label = MODE_LABEL[normalized];
  if (!label) return null;
  return (
    <span className={AGENT_LIST_ITEM_MODE_BADGE_CLASS_NAME}>
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <circle cx="12" cy="12" r="5" />
      </svg>
      <span>{label}</span>
    </span>
  );
};

interface SortableAgentListItemProps {
  agent: Agent;
  agentKey: string;
  diagnosticMessage: string;
  disabled: boolean;
  isActive: boolean;
  isDragging: boolean;
  isInvalid: boolean;
  name: string;
  sortableId: string;
  summary: ReturnType<typeof buildAgentListSummary>;
  t: Translate;
  onSelect: (agentKey: string) => void;
}

const SortableAgentListItem: React.FC<SortableAgentListItemProps> = ({
  agent,
  agentKey,
  diagnosticMessage,
  disabled,
  isActive,
  isDragging,
  isInvalid,
  name,
  sortableId,
  summary,
  t,
  onSelect,
}) => {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: sortableId,
    disabled: disabled || !agentKey,
  });
  const isCoderMode = summary.mode.toUpperCase() === "CODER";
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      className={`${AGENT_LIST_ITEM_CLASS_NAME} ${isActive ? "is-active" : ""} ${isDragging ? "is-dragging" : ""} ${isInvalid ? "is-invalid" : ""}`}
      onClick={() => onSelect(agentKey)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(agentKey);
        }
      }}
    >
      <span className={AGENT_LIST_ITEM_ICON_COL_CLASS_NAME}>
        <span
          ref={setActivatorNodeRef}
          className={`${AGENT_LIST_ITEM_ICON_CLASS_NAME} ${disabled || !agentKey ? "" : "is-drag-handle"}`}
          aria-label={t("agentConsole.list.dragHandle", { name })}
          {...attributes}
          {...listeners}
        >
          <AgentIcon
            icon={agent.icon}
            type="agent"
            props={{
              icon: {
                width: 28,
                height: 28,
                className: AGENT_LIST_ITEM_SVG_CLASS_NAME,
              },
              avatar: { size: 28, icon: <MaterialIcon name="smart_toy" /> },
            }}
          />
        </span>
      </span>
      <span className={AGENT_LIST_ITEM_MAIN_CLASS_NAME}>
        <span className={AGENT_LIST_ITEM_HEAD_CLASS_NAME}>
          <strong>{name}</strong>
          {(isInvalid || !isCoderMode) && (
            <span className={AGENT_LIST_ITEM_HEAD_META_CLASS_NAME}>
              {isInvalid && (
                <span className={AGENT_STATUS_INVALID_CLASS_NAME}>
                  {t("agentConsole.status.invalid")}
                </span>
              )}
              {!isCoderMode && <span>{agentKey || "--"}</span>}
            </span>
          )}
        </span>
        <span className={AGENT_LIST_ITEM_META_CLASS_NAME}>
          <span>{summary.modelKey}</span>
          <span className={AGENT_LIST_ITEM_COUNTS_CLASS_NAME}>
            <span className={AGENT_LIST_ITEM_COUNT_CLASS_NAME}>
              <svg
                className={AGENT_LIST_ITEM_COUNT_ICON_CLASS_NAME}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
              {summary.toolsCount}
            </span>
            <span className={AGENT_LIST_ITEM_COUNT_SEP_CLASS_NAME}>·</span>
            <span className={AGENT_LIST_ITEM_COUNT_CLASS_NAME}>
              <svg
                className={AGENT_LIST_ITEM_COUNT_ICON_CLASS_NAME}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              {summary.skillsCount}
            </span>
            <span className={AGENT_LIST_ITEM_COUNT_SEP_CLASS_NAME}>·</span>
            <ModeBadge mode={summary.mode} />
          </span>
        </span>
        {isInvalid && diagnosticMessage && (
          <span className={AGENT_LIST_ITEM_DIAGNOSTIC_CLASS_NAME}>
            {diagnosticMessage}
          </span>
        )}
      </span>
    </div>
  );
};

export const AgentConsole: React.FC<AgentConsoleProps> = ({
  selectedAgentKey = "",
  onSelectAgentKey,
  onClearSelection,
  onDirtyChange,
  embedded = false,
}) => {
  const { t } = useI18n();
  const { state, dispatch } = useAppContext();
  const [internalSelectedKey, setInternalSelectedKey] = useState("");
  const effectiveSelectedKey = selectedAgentKey || internalSelectedKey;
  const [searchText, setSearchText] = useState("");
  const [formMode, setFormMode] = useState<AgentFormMode>("create");
  const [editorMode, setEditorMode] = useState<AgentEditorMode>("structured");
  const [activeSectionId, setActiveSectionId] = useState<AgentFormSectionId>(
    AGENT_FORM_SECTION_IDS[0],
  );
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [detail, setDetail] = useState<EditableAgentDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [editorOptions, setEditorOptions] =
    useState<AgentEditorOptionsResponse | null>(null);
  const [toolOptions, setToolOptions] = useState<AgentToolOption[]>([]);
  const [skillOptions, setSkillOptions] = useState<Array<{ key: string; label: string }>>([]);
  const [savingForm, setSavingForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [privateSkillModalOpen, setPrivateSkillModalOpen] = useState(false);
  const [privateSkillFile, setPrivateSkillFile] = useState<File | null>(null);
  const [privateSkillOverrideRequired, setPrivateSkillOverrideRequired] = useState(false);
  const [privateSkillOverrideConfirmed, setPrivateSkillOverrideConfirmed] = useState(false);
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
  const didInitialSelectRef = useRef(false);
  const didBootstrapAgentsRef = useRef(false);
  const didBootstrapOptionsRef = useRef(false);
  const listLoadSeqRef = useRef(0);
  const optionsLoadSeqRef = useRef(0);
  const sourceLoadSeqRef = useRef(0);
  const selectedAgentKeyRef = useRef(selectedAgentKey);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const sectionNavLinksRef = useRef<HTMLDivElement>(null);
  const privateSkillFileInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const filteredAgents = useMemo(() => {
    const agents = Array.isArray(state.agents) ? state.agents : [];
    return filterAgentsPreservingOrder(agents, searchText);
  }, [searchText, state.agents]);
  const filteredAgentSortableIds = useMemo(
    () =>
      filteredAgents.map(
        (agent, index) => toText(agent.key) || `agent-console-empty-${index}`,
      ),
    [filteredAgents],
  );

  const selectedSummary = useMemo(
    () =>
      state.agents.find(
        (agent) => toText(agent.key) === effectiveSelectedKey,
      ) || null,
    [effectiveSelectedKey, state.agents],
  );

  const modeOptions = useMemo(
    () =>
      (editorOptions?.modes?.length
        ? editorOptions.modes
        : [
            { key: "REACT", label: "REACT" },
            { key: "PLAN_EXECUTE", label: "PLAN-EXECUTE" },
            { key: "PROXY", label: "ACP-PROXY" },
          ]
      ).map((item) => ({ value: item.key, label: item.label })),
    [editorOptions],
  );
  const modelOptions = useMemo(
    () =>
      (editorOptions?.models || []).map((item) => {
        const name = String(item.name || "").trim();
        const key = String(item.key || "").trim();
        return {
          value: item.key,
          label: name || (item.modelId ? key + " · " + item.modelId : key),
        };
      }),
    [editorOptions],
  );
  const selectedModelReasoningEfforts = useMemo(
    () => getModelReasoningEfforts(editorOptions?.models, form.modelKey),
    [editorOptions, form.modelKey],
  );
  const selectedModelReasoningSupported = toText(form.modelKey)
    ? selectedModelReasoningEfforts.length > 0
    : undefined;
  const reasoningEffortOptions = useMemo(
    () =>
      selectedModelReasoningEfforts.map((effort) => ({
        value: effort,
        label: effort,
      })),
    [selectedModelReasoningEfforts],
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
  const privateSkills = useMemo(() => privateSkillsFromDetail(detail), [detail]);
  const agentSkillOptions = useMemo(
    () => mergeAgentSkillOptions(skillOptions, privateSkills, form.skills, t),
    [form.skills, privateSkills, skillOptions, t],
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
        id: AGENT_FORM_SECTION_IDS[2],
        label: t("agentConsole.section.capabilities"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[3],
        label: t("agentConsole.section.advancedConfig"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[4],
        label: t("agentConsole.section.prompts"),
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
  const detailSubtitle =
    formMode === "create"
      ? t("agentConsole.detail.createSubtitle")
      : detailSourcePath || form.key;
  const canOpenDetailDirectory = shouldShowAgentDirectoryButton(
    formMode,
    detailSourcePath,
  );

  const handleOpenDetailDirectory = useCallback(() => {
    const options = buildAgentConfigDirectoryOpenOptions(form.key);
    if (!options) return;
    void openRegisteredAgentDirectory(options).catch((error) => {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[open directory error] ${(error as Error).message}`,
      });
    });
  }, [dispatch, form.key]);
  const handleSectionNavigate = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      sectionId: AgentFormSectionId,
    ) => {
      event.preventDefault();
      const section = detailScrollRef.current?.querySelector<HTMLElement>(
        `#${sectionId}`,
      );
      if (!section) return;
      setActiveSectionId(sectionId);
      section.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    },
    [],
  );
  const canEditStructuredAgent =
    formMode === "create" || hasEditableAdminDefinition(detail);
  const canEditSourceAgent = formMode === "edit" && Boolean(detailSourcePath);
  const hasUnsavedChanges = structuredDirty || sourceDirty;
  const savePlacement = resolveAgentSavePlacement(
    formMode,
    editorMode,
    canEditStructuredAgent,
  );
  const canImportPrivateSkill =
    formMode === "edit" &&
    canEditStructuredAgent &&
    toText(detail?.source?.kind).toLowerCase() === "directory" &&
    !hasUnsavedChanges &&
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
    setActiveSectionId(AGENT_FORM_SECTION_IDS[0]);
  }, [editorMode, effectiveSelectedKey, formMode]);

  useEffect(() => {
    if (!shouldShowAgentSectionNav(editorMode, canEditStructuredAgent)) return;
    const scrollContainer = detailScrollRef.current;
    if (!scrollContainer) return;

    let animationFrame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const nav =
          scrollContainer.querySelector<HTMLElement>(".agent-section-nav");
        const activationLine =
          (nav?.getBoundingClientRect().bottom ??
            scrollContainer.getBoundingClientRect().top) + 8;
        const sectionTops = AGENT_FORM_SECTION_IDS.map((sectionId) => {
          const section = scrollContainer.querySelector<HTMLElement>(
            `#${sectionId}`,
          );
          return (
            section?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
          );
        });
        const atBottom =
          scrollContainer.scrollTop + scrollContainer.clientHeight >=
          scrollContainer.scrollHeight - 2;
        const nextSectionId = resolveActiveAgentFormSection(
          sectionTops,
          activationLine,
          atBottom,
        );
        setActiveSectionId((currentSectionId) =>
          currentSectionId === nextSectionId ? currentSectionId : nextSectionId,
        );
      });
    };

    updateActiveSection();
    scrollContainer.addEventListener("scroll", updateActiveSection, {
      passive: true,
    });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      scrollContainer.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [
    canEditStructuredAgent,
    editorMode,
    effectiveSelectedKey,
    form.iconKind,
    form.mode,
    form.reasoningEnabled,
  ]);

  useEffect(() => {
    const links = sectionNavLinksRef.current;
    const activeLink = links?.querySelector<HTMLElement>(
      `a[href="#${activeSectionId}"]`,
    );
    if (!links || !activeLink) return;

    const linkLeft = activeLink.offsetLeft;
    const linkRight = linkLeft + activeLink.offsetWidth;
    const visibleLeft = links.scrollLeft;
    const visibleRight = visibleLeft + links.clientWidth;
    if (linkLeft < visibleLeft) {
      links.scrollTo({ left: linkLeft, behavior: "smooth" });
    } else if (linkRight > visibleRight) {
      links.scrollTo({
        left: linkRight - links.clientWidth,
        behavior: "smooth",
      });
    }
  }, [activeSectionId]);

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
    setFormMode("create");
    setEditorMode("structured");
    setForm(EMPTY_FORM);
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
      !hasUnsavedChanges || window.confirm(t("agentConsole.confirm.switch")),
    [hasUnsavedChanges, t],
  );

  const selectAgent = useCallback(
    (agentKey: string) => {
      const key = agentKey.trim();
      if (key === effectiveSelectedKey) return;
      if (!confirmDiscardChanges()) return;
      commitAgentSelection(key);
    },
    [commitAgentSelection, confirmDiscardChanges, effectiveSelectedKey],
  );

  const startCreate = useCallback(() => {
    if (!confirmDiscardChanges()) return;
    resetToCreate();
  }, [confirmDiscardChanges, resetToCreate]);

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
        dispatch({ type: "SET_AGENTS", agents });
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingAgentKey(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const sourceKey = String(event.active.id);
      const targetKey = event.over ? String(event.over.id) : "";
      setDraggingAgentKey("");
      if (!sourceKey || !targetKey || sourceKey === targetKey || savingOrder)
        return;
      const nextAgents = moveAgentForDrop(state.agents, sourceKey, targetKey);
      if (nextAgents === state.agents) return;
      dispatch({ type: "SET_AGENTS", agents: nextAgents });
      await saveAgentOrder(nextAgents);
    },
    [dispatch, saveAgentOrder, savingOrder, state.agents],
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
            return key ? { key, label: optionLabel(record) || key } : null;
          })
          .filter((item): item is { key: string; label: string } =>
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
    if (effectiveSelectedKey) {
      void loadDetail(effectiveSelectedKey);
    } else if (state.agents.length === 0 && !loadingList) {
      resetToCreate();
    }
  }, [
    effectiveSelectedKey,
    loadDetail,
    loadingList,
    resetToCreate,
    state.agents.length,
  ]);

  const updateForm = (patch: Partial<AgentFormState>) => {
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

  const setReasoningEnabled = (enabled: boolean) => {
    updateForm({
      reasoningConfigured: true,
      reasoningEnabled: enabled,
      reasoningEffort: enabled
        ? form.reasoningEffort ||
          defaultReasoningEffort(selectedModelReasoningEfforts)
        : "",
    });
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
      setSourceDraft("");
      setSourceSha256("");
      setSourcePath("");
      setSourceLoadedKey("");
      setSourceDirty(false);
      setStructuredDirty(false);
      message.success(t("agentConsole.message.saveSuccess"));
      await loadAgents(savedKey);
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
    setPrivateSkillOverrideRequired(false);
    setPrivateSkillOverrideConfirmed(false);
    setPrivateSkillError("");
    if (privateSkillFileInputRef.current) privateSkillFileInputRef.current.value = "";
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
    if (privateSkillOverrideRequired && !privateSkillOverrideConfirmed) {
      setPrivateSkillError(t("agentConsole.privateSkill.import.overrideRequired"));
      return;
    }
    setPrivateSkillImporting(true);
    setPrivateSkillError("");
    try {
      const response = await importAdminAgentPrivateSkill({
        agentKey,
        file: privateSkillFile,
        confirmCenterOverride: privateSkillOverrideConfirmed,
      });
      const saved = response.data;
      setDetail(saved);
      setForm(formFromDetail(saved));
      setStructuredDirty(false);
      setPrivateSkillModalOpen(false);
      resetPrivateSkillImport();
      await loadAgents(agentKey);
      commitAgentSelection(agentKey);
      message.success(t("agentConsole.privateSkill.import.success"));
    } catch (error) {
      const detail = (error as Error).message;
      const data = (error as { data?: unknown }).data;
      if (
        data != null &&
        typeof data === "object" &&
        (data as { requiresConfirmation?: unknown }).requiresConfirmation === true
      ) {
        setPrivateSkillOverrideRequired(true);
      }
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
      content: t("agentConsole.privateSkill.delete.description", { name: skill.name || skill.key }),
      okText: t("agentConsole.privateSkill.delete.confirm"),
      cancelText: t("agentConsole.privateSkill.delete.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingPrivateSkillKey(skill.key);
        setFormError("");
        try {
          const response = await deleteAdminAgentPrivateSkill({ agentKey, key: skill.key });
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
      const remaining = state.agents.filter(
        (agent) => toText(agent.key) !== key,
      );
      dispatch({ type: "SET_AGENTS", agents: remaining });
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

  const applySourceResponse = (response: AdminSourceResponse) => {
    setSourceDraft(response.content);
    setSourceSha256(response.sha256);
    setSourcePath(response.source?.path || "");
    setSourceLoadedKey(response.target.key || "");
    setSourceDirty(false);
  };

  const toggleEditorMode = async () => {
    if (!canEditSourceAgent) return;
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
      const detailResponse = await getAdminAgentDetail(key);
      if (sourceLoadSeqRef.current === requestSeq) {
        const nextDetail = detailResponse.data as EditableAgentDetail;
        setDetail(nextDetail);
        setForm(formFromDetail(nextDetail));
        setFormMode("edit");
        setStructuredDirty(false);
      }
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSavingForm(false);
    }
  };

  const sourceSaveDisabled =
    savingForm || deleting || loadingSource || sourceLoadedKey !== form.key || !sourceDirty;

  return (
    <div
      className={`${embedded ? "command-modal-section" : "management-page-console"} ${AGENT_CONSOLE_CLASS_NAME} ${embedded ? "is-embedded" : ""}`}
    >
      <Modal
        open={privateSkillModalOpen}
        title={t("agentConsole.privateSkill.import.title")}
        okText={t("agentConsole.privateSkill.import.submit")}
        cancelText={t("agentConsole.action.cancelEdit")}
        confirmLoading={privateSkillImporting}
        okButtonProps={{
          disabled:
            !privateSkillFile ||
            (privateSkillOverrideRequired && !privateSkillOverrideConfirmed),
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
        <div className="tw:flex tw:flex-col tw:gap-3">
          <input
            ref={privateSkillFileInputRef}
            className="tw:hidden"
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              setPrivateSkillFile(event.target.files?.[0] || null);
              setPrivateSkillOverrideRequired(false);
              setPrivateSkillOverrideConfirmed(false);
              setPrivateSkillError("");
            }}
          />
          <div className="tw:flex tw:items-center tw:gap-2">
            <UiButton
              size="sm"
              variant="secondary"
              onClick={() => privateSkillFileInputRef.current?.click()}
              disabled={privateSkillImporting}
            >
              <MaterialIcon name="folder_zip" />
              {t("agentConsole.privateSkill.import.selectFile")}
            </UiButton>
            <span className="tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:text-ink-muted">
              {privateSkillFile?.name || t("agentConsole.privateSkill.import.noFile")}
            </span>
          </div>
          {privateSkillOverrideRequired && (
            <Checkbox
              checked={privateSkillOverrideConfirmed}
              onChange={(event) => setPrivateSkillOverrideConfirmed(event.target.checked)}
            >
              {t("agentConsole.privateSkill.import.overrideConfirm")}
            </Checkbox>
          )}
          <div className="tw:text-xs tw:leading-5 tw:text-ink-muted">
            {t("agentConsole.privateSkill.import.description")}
          </div>
          {privateSkillError && <div className="tw:text-xs tw:text-danger">{privateSkillError}</div>}
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
        <div className={AGENT_LIST_CLASS_NAME}>
          <div className={AGENT_TOOLBAR_CLASS_NAME}>
            <Input
              prefix={
                <MaterialIcon
                  name="search"
                  style={{ color: "var(--text-muted)" }}
                />
              }
              variant="filled"
              placeholder={t("agentConsole.searchPlaceholder")}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <UiButton
              size="sm"
              variant="ghost"
              iconOnly
              onClick={() => loadAgents(effectiveSelectedKey)}
              disabled={savingForm || deleting}
              loading={loadingList}
              aria-label={t("agentConsole.action.refresh")}
            >
              <MaterialIcon name="refresh" />
            </UiButton>
            <UiButton
              size="sm"
              variant="primary"
              iconOnly
              aria-label={t("agentConsole.action.new")}
              onClick={startCreate}
            >
              <MaterialIcon name="add" />
            </UiButton>
          </div>
          <div className={AGENT_COUNT_CLASS_NAME}>
            <span>
              {t("agentConsole.list.count", { count: state.agents.length })}
            </span>
            {savingOrder && <span>{t("agentConsole.list.savingOrder")}</span>}
          </div>
          <div className={AGENT_LIST_SCROLL_CLASS_NAME}>
            <Spin spinning={loadingList || savingOrder}>
              {filteredAgents.length === 0 ? (
                <div className="command-empty-state">
                  {t("agentConsole.empty")}
                  <UiButton size="sm" variant="primary" onClick={startCreate}>
                    {t("agentConsole.action.create")}
                  </UiButton>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragCancel={() => setDraggingAgentKey("")}
                  onDragEnd={(event) => {
                    void handleDragEnd(event);
                  }}
                >
                  <SortableContext
                    items={filteredAgentSortableIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={AGENT_LIST_ITEMS_CLASS_NAME}>
                      {filteredAgents.map((agent, index) => {
                        const agentKey = toText(agent.key);
                        const name = toText(agent.name) || agentKey;
                        const summary = buildAgentListSummary(
                          agent,
                          agentKey === form.key ? form : undefined,
                        );
                        const sortableId =
                          agentKey || `agent-console-empty-${index}`;
                        const isInvalid = isInvalidAdminAgent(agent);
                        const diagnosticMessage =
                          firstAdminAgentDiagnosticMessage(agent);
                        return (
                          <SortableAgentListItem
                            key={sortableId}
                            agent={agent}
                            agentKey={agentKey}
                            diagnosticMessage={diagnosticMessage}
                            disabled={savingOrder}
                            isActive={agentKey === effectiveSelectedKey}
                            isDragging={agentKey === draggingAgentKey}
                            isInvalid={isInvalid}
                            name={name}
                            sortableId={sortableId}
                            summary={summary}
                            t={t}
                            onSelect={selectAgent}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </Spin>
          </div>
        </div>

        <div
          ref={detailScrollRef}
          className={`${AGENT_DETAIL_CLASS_NAME} ${editorMode === "source" ? "is-source-editor" : ""}`}
        >
          <Spin spinning={loadingDetail || loadingSource}>
            <div className={AGENT_DETAIL_HEAD_CLASS_NAME}>
              <div>
                <strong>
                  {formMode === "create"
                    ? t("agentConsole.detail.titleCreate")
                    : selectedSummary?.name ||
                      form.name ||
                      form.key ||
                      t("agentConsole.detail.titleEdit")}
                </strong>
                <div className={AGENT_DETAIL_PATH_ROW_CLASS_NAME}>
                  <span
                    className={
                      canOpenDetailDirectory
                        ? "tw:cursor-pointer tw:hover:underline tw:hover:text-ink-1 tw:transition-colors"
                        : ""
                    }
                    onClick={
                      canOpenDetailDirectory
                        ? handleOpenDetailDirectory
                        : undefined
                    }
                    title={
                      canOpenDetailDirectory
                        ? t("agentConsole.detail.openDirectory")
                        : undefined
                    }
                  >
                    {detailSubtitle}
                  </span>
                  {canOpenDetailDirectory && (
                    <UiButton
                      className="agent-detail-open-directory"
                      size="mini"
                      variant="ghost"
                      iconOnly
                      onClick={handleOpenDetailDirectory}
                      aria-label={t("agentConsole.detail.openDirectory")}
                      title={t("agentConsole.detail.openDirectory")}
                    >
                      <MaterialIcon name="folder_open" />
                    </UiButton>
                  )}
                </div>
              </div>
              {formMode === "edit" && (
                <div className={AGENT_DETAIL_ACTIONS_CLASS_NAME}>
                  {canEditSourceAgent && (
                    <UiButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void toggleEditorMode();
                      }}
                      disabled={savingForm || deleting || loadingSource}
                    >
                      <MaterialIcon
                        name={editorMode === "source" ? "tune" : "code"}
                      />
                      <span>
                        {editorMode === "source"
                          ? t("agentConsole.action.structuredEdit")
                          : t("agentConsole.action.sourceEdit")}
                      </span>
                    </UiButton>
                  )}
                  <Popconfirm
                    title={t("agentConsole.confirm.deleteTitle")}
                    okText={t("agentConsole.confirm.deleteOk")}
                    cancelText={t("agentConsole.confirm.deleteCancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={confirmDelete}
                    disabled={deleting}
                  >
                    <UiButton
                      size="sm"
                      variant="danger"
                      disabled={deleting || savingForm}
                      loading={deleting}
                    >
                      <MaterialIcon name="delete" />
                      <span>{t("agentConsole.action.delete")}</span>
                    </UiButton>
                  </Popconfirm>
                  {savePlacement.header && editorMode === "source" ? (
                    <UiButton
                      size="sm"
                      variant="primary"
                      onClick={saveSource}
                      disabled={sourceSaveDisabled}
                      loading={savingForm}
                    >
                      <MaterialIcon name="save" />
                      <span>{t("agentConsole.action.saveSource")}</span>
                    </UiButton>
                  ) : savePlacement.header ? (
                    <UiButton
                      size="sm"
                      variant="primary"
                      onClick={saveForm}
                      disabled={!canEditStructuredAgent || deleting}
                      loading={savingForm}
                    >
                      <MaterialIcon name="save" />
                      <span>{t("agentConsole.action.saveChanges")}</span>
                    </UiButton>
                  ) : null}
                </div>
              )}
            </div>

            {shouldShowAgentSectionNav(editorMode, canEditStructuredAgent) && (
              <nav
                className={AGENT_SECTION_NAV_CLASS_NAME}
                aria-label={t("agentConsole.sectionNav.ariaLabel")}
              >
                <div
                  ref={sectionNavLinksRef}
                  className={AGENT_SECTION_NAV_LINKS_CLASS_NAME}
                >
                  {agentFormSections.map((section) => (
                    <a
                      className={AGENT_SECTION_NAV_LINK_CLASS_NAME}
                      href={`#${section.id}`}
                      aria-current={
                        activeSectionId === section.id ? "location" : undefined
                      }
                      key={section.id}
                      onClick={(event) =>
                        handleSectionNavigate(event, section.id)
                      }
                    >
                      {section.label}
                    </a>
                  ))}
                </div>
                {savePlacement.sticky && (
                  <UiButton
                    className={AGENT_SECTION_NAV_SAVE_CLASS_NAME}
                    size="sm"
                    variant="primary"
                    onClick={saveForm}
                    disabled={!canEditStructuredAgent || deleting}
                    loading={savingForm}
                  >
                    <MaterialIcon name="save" />
                    <span>{t("agentConsole.action.saveChanges")}</span>
                  </UiButton>
                )}
              </nav>
            )}

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
                <div className="agent-source-workspace">
                  <div className="field-group agent-source-field">
                    <label htmlFor="agent-source-editor">
                      {t("agentConsole.field.sourceFile")}
                    </label>
                    <Input.TextArea
                      id="agent-source-editor"
                      className={AGENT_SOURCE_EDITOR_CLASS_NAME}
                      value={sourceDraft}
                      onChange={(event) => {
                        setSourceDraft(event.target.value);
                        setSourceDirty(true);
                        setFormError("");
                      }}
                    />
                  </div>
                  {formError && (
                    <div className="settings-error">{formError}</div>
                  )}
                  {sourceDirty && (
                    <div className={AGENT_SAVE_ACTIONS_CLASS_NAME}>
                      <span className={AGENT_DIRTY_CLASS_NAME}>
                        {t("agentConsole.message.unsaved")}
                      </span>
                    </div>
                  )}
                </div>
              ) : null
            ) : canEditStructuredAgent ? (
              <>
                <AgentFormSection
                  active={activeSectionId === AGENT_FORM_SECTION_IDS[0]}
                  id={AGENT_FORM_SECTION_IDS[0]}
                  icon="person"
                  title={t("agentConsole.section.basic")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className="field-group">
                      <label htmlFor="agent-key-input">
                        {t("agentConsole.field.key")}
                      </label>
                      <Input
                        id="agent-key-input"
                        value={form.key}
                        disabled={formMode === "edit"}
                        onChange={(event) =>
                          updateForm({ key: event.target.value })
                        }
                      />
                    </div>
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
                    <div className="field-group">
                      <label htmlFor="agent-mode-input">
                        {t("agentConsole.field.mode")}
                      </label>
                      <Select
                        id="agent-mode-input"
                        value={form.mode}
                        options={modeOptions}
                        onChange={setMode}
                      />
                    </div>
                    <div className="field-group">
                      <label htmlFor="agent-icon-kind-input">
                        {t("agentConsole.field.icon")}
                      </label>
                      <div className={AGENT_ICON_EDITOR_CLASS_NAME}>
                        <span className={AGENT_ICON_PREVIEW_CLASS_NAME}>
                          <AgentIcon
                            icon={selectedIconValue as any}
                            type="agent"
                          />
                        </span>
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
                    <div className="field-group">
                      <label htmlFor="agent-visibility-input">
                        {t("agentConsole.field.visibility")}
                      </label>
                      <Select
                        id="agent-visibility-input"
                        mode="multiple"
                        allowClear
                        loading={loadingOptions}
                        value={form.visibilityScopes}
                        options={visibilityScopeOptions}
                        onChange={(value) =>
                          updateForm({ visibilityScopes: value })
                        }
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-description-input">
                        {t("agentConsole.field.description")}
                      </label>
                      <Input.TextArea
                        id="agent-description-input"
                        rows={3}
                        value={form.description}
                        onChange={(event) =>
                          updateForm({ description: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </AgentFormSection>

                <AgentFormSection
                  active={activeSectionId === AGENT_FORM_SECTION_IDS[1]}
                  id={AGENT_FORM_SECTION_IDS[1]}
                  icon="psychology"
                  title={t("agentConsole.section.model")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className="field-group">
                      <label htmlFor="agent-model-input">
                        {t("agentConsole.field.modelKey")}
                      </label>
                      <Select
                        id="agent-model-input"
                        showSearch
                        allowClear
                        loading={loadingOptions}
                        value={form.modelKey || undefined}
                        options={modelOptions}
                        optionFilterProp="label"
                        onChange={setModelKey}
                      />
                    </div>
                    {selectedModelReasoningSupported === true && (
                      <>
                        <div className="field-group">
                          <label htmlFor="agent-reasoning-enabled-input">
                            {t("agentConsole.field.reasoningEnabled")}
                          </label>
                          <Switch
                            id="agent-reasoning-enabled-input"
                            checked={form.reasoningEnabled}
                            onChange={setReasoningEnabled}
                          />
                        </div>
                        {form.reasoningEnabled && (
                          <div className="field-group">
                            <label htmlFor="agent-reasoning-effort-input">
                              {t("agentConsole.field.reasoningEffort")}
                            </label>
                            <Select
                              id="agent-reasoning-effort-input"
                              value={form.reasoningEffort || undefined}
                              options={reasoningEffortOptions}
                              onChange={(value) =>
                                updateForm({
                                  reasoningConfigured: true,
                                  reasoningEffort: toText(value),
                                })
                              }
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </AgentFormSection>

                <AgentFormSection
                  active={activeSectionId === AGENT_FORM_SECTION_IDS[2]}
                  id={AGENT_FORM_SECTION_IDS[2]}
                  icon="hub"
                  title={t("agentConsole.section.capabilities")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-tags-input">
                        {t("agentConsole.field.contextTags")}
                      </label>
                      <Select
                        id="agent-tags-input"
                        mode="multiple"
                        allowClear
                        loading={loadingOptions}
                        value={form.contextTags}
                        options={contextTagOptions}
                        onChange={(value) => updateForm({ contextTags: value })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-tools-input">
                        {t("agentConsole.field.tools")}
                      </label>
                      <Select
                        id="agent-tools-input"
                        mode="multiple"
                        showSearch
                        allowClear
                        loading={loadingOptions}
                        value={form.tools}
                        options={toolOptions.map((item) => ({
                          value: item.key,
                          label: toolOptionLabel(item, t),
                        }))}
                        optionFilterProp="label"
                        onChange={(value) => updateForm({ tools: value })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
                        <label htmlFor="agent-skills-input">
                          {t("agentConsole.field.skills")}
                        </label>
                        <UiButton
                          size="sm"
                          variant="ghost"
                          onClick={openPrivateSkillImport}
                          disabled={!canImportPrivateSkill}
                          title={
                            canImportPrivateSkill
                              ? t("agentConsole.privateSkill.import.title")
                              : t("agentConsole.privateSkill.import.disabled")
                          }
                        >
                          <MaterialIcon name="folder_zip" />
                          {t("agentConsole.privateSkill.import.action")}
                        </UiButton>
                      </div>
                      <Select
                        id="agent-skills-input"
                        mode="multiple"
                        showSearch
                        allowClear
                        loading={loadingOptions}
                        value={form.skills}
                        options={agentSkillOptions.map((item) => ({
                          value: item.key,
                          label: item.label,
                        }))}
                        optionFilterProp="label"
                        onChange={(value) => updateForm({ skills: value })}
                      />
                      {privateSkills.length > 0 && (
                        <div className="tw:mt-2 tw:flex tw:flex-col tw:gap-1.5">
                          {privateSkills.map((skill) => (
                            <div
                              key={skill.key}
                              className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-control tw:border tw:px-2 tw:py-1.5 tw:text-xs tw:[border-color:color-mix(in_srgb,var(--line-soft)_82%,transparent)]"
                            >
                              <span className="tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                                {skill.name || skill.key} · {skill.key} · {skill.overridesCenter
                                  ? t("agentConsole.privateSkill.source.override")
                                  : t("agentConsole.privateSkill.source.private")}
                              </span>
                              <UiButton
                                size="mini"
                                variant="danger"
                                onClick={() => confirmDeletePrivateSkill(skill)}
                                disabled={!canImportPrivateSkill || deletingPrivateSkillKey === skill.key}
                                loading={deletingPrivateSkillKey === skill.key}
                              >
                                <MaterialIcon name="delete" />
                                {t("agentConsole.privateSkill.delete.action")}
                              </UiButton>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </AgentFormSection>

                <AgentFormSection
                  active={activeSectionId === AGENT_FORM_SECTION_IDS[3]}
                  id={AGENT_FORM_SECTION_IDS[3]}
                  icon="tune"
                  title={t("agentConsole.section.advancedConfig")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className="field-group">
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
                    <div className="field-group">
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
                    <div className="field-group">
                      <label htmlFor="agent-memory-input">
                        {t("agentConsole.field.memoryConfig")}
                      </label>
                      <Input.TextArea
                        id="agent-memory-input"
                        className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                        rows={5}
                        value={form.memoryConfigText}
                        onChange={(event) =>
                          updateForm({ memoryConfigText: event.target.value })
                        }
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-budget-input">
                        {t("agentConsole.field.budget")}
                      </label>
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

                <AgentFormSection
                  active={activeSectionId === AGENT_FORM_SECTION_IDS[4]}
                  id={AGENT_FORM_SECTION_IDS[4]}
                  icon="subject"
                  title={t("agentConsole.section.prompts")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label>{t("agentConsole.field.greetings")}</label>
                      <AgentStringListEditor
                        values={form.greetings}
                        addLabel={t("agentConsole.greetings.add")}
                        removeLabel={t("agentConsole.greetings.remove")}
                        onChange={(greetings) => updateForm({ greetings })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label>{t("agentConsole.field.wonders")}</label>
                      <AgentStringListEditor
                        values={form.wonders}
                        addLabel={t("agentConsole.wonders.add")}
                        removeLabel={t("agentConsole.wonders.remove")}
                        onChange={(wonders) => updateForm({ wonders })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-soul-input">
                        {t("agentConsole.field.soulMd")}
                      </label>
                      <Input.TextArea
                        id="agent-soul-input"
                        className={AGENT_PROMPT_TEXTAREA_CLASS_NAME}
                        rows={5}
                        value={form.soulPrompt}
                        onChange={(event) =>
                          updateForm({ soulPrompt: event.target.value })
                        }
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-agents-input">
                        {t("agentConsole.field.agentsMd")}
                      </label>
                      <Input.TextArea
                        id="agent-agents-input"
                        className={AGENT_PROMPT_TEXTAREA_CLASS_NAME}
                        rows={5}
                        value={form.agentsPrompt}
                        onChange={(event) =>
                          updateForm({ agentsPrompt: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </AgentFormSection>
              </>
            ) : (
              <div className={AGENT_UNEDITABLE_CLASS_NAME}>
                <MaterialIcon name="warning" />
                <span>{t("agentConsole.diagnostics.uneditable")}</span>
              </div>
            )}

            {editorMode !== "source" && (
              <>
                {formError && <div className="settings-error">{formError}</div>}
                <div className={AGENT_SAVE_ACTIONS_CLASS_NAME}>
                  {savePlacement.footer ? (
                    <UiButton
                      size="sm"
                      variant="primary"
                      onClick={saveForm}
                      disabled={!canEditStructuredAgent || deleting}
                      loading={savingForm}
                    >
                      <MaterialIcon name="save" />
                      <span>{t("agentConsole.action.create")}</span>
                    </UiButton>
                  ) : (
                    <UiButton
                      size="sm"
                      variant="ghost"
                      onClick={startCreate}
                      disabled={savingForm || deleting}
                    >
                      {t("agentConsole.action.cancelEdit")}
                    </UiButton>
                  )}
                </div>
              </>
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
};

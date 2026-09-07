import type { Agent } from "@/features/agents/lib/agentState";
import type { AgentSkillOption, AgentToolOption } from "@/features/agents/lib/agentOptions";
import { ACTIVE_QUERY_REASONING_EFFORTS, normalizeQueryReasoningEffort } from "@/shared/data/api/reasoningEffort";
import type { AdminAgentDetailResponse, AdminAgentDiagnostic, AdminAgentPrivateSkill, AdminToolSummary, AgentDetailResponse, AgentEditorModelOption } from "@/shared/data";
import type { MutableValueRef } from "@/shared/contracts/stateInterop";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import type { I18nContextValue } from "@/shared/i18n";
export type AgentFormMode = "create" | "edit";
export type AgentEditorMode = "structured" | "source";
export type AgentInteractionMode = "view" | "edit";
export type IconKind = "none" | "builtin" | "image";
export type AgentToolFilter = "all" | "file" | "desktop" | "system";
export type Translate = I18nContextValue["t"];

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
export type EditableAgentDetail = AgentDetailResponse | AdminAgentDetailResponse;

export type ChoicePresentation = {
  icon: MaterialIconName;
  label: string;
  description: string;
};
export interface AgentFormState {
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
export const EMPTY_FORM: AgentFormState = {
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

export function createEmptyAgentForm(): AgentFormState {
  const suffix = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return { ...EMPTY_FORM, key: `agent-${suffix}` };
}

export const BUDGET_PLACEHOLDER = `{
  "runTimeoutMs": 600000,
  "maxSteps": 240,
  "model": { "maxCalls": 240 },
  "tool": { "maxCalls": 200 }
}`;
export const SIMPLE_BUDGET_TEMPLATE = `{
  "runTimeoutMs": 600000,
  "maxSteps": 120
}`;
export const DEFAULT_REASONING_EFFORTS = [...ACTIVE_QUERY_REASONING_EFFORTS];

export function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function normalizeReasoningEffort(value: unknown): string {
  return normalizeQueryReasoningEffort(value) || "";
}

export function normalizeServiceTier(value: unknown): string {
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

export function reasoningEffortLabel(effort: string, t: Translate): string {
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

export function readAdminToolKind(tool: Partial<AdminToolSummary>): string {
  return toText(tool.kind);
}

export function readAdminToolSourceCategory(tool: Partial<AdminToolSummary>): string {
  return toText(tool.sourceCategory);
}

export function toolSourceLabel(sourceCategory: string, t: Translate): string {
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

export function toolFilterForOption(option: AgentToolOption): Exclude<
  AgentToolFilter,
  "all"
> {
  const haystack = `${option.key} ${option.label} ${option.kind}`.toLowerCase();
  if (/file|path|glob|grep/.test(haystack)) return "file";
  if (/desktop|screen|window|clipboard/.test(haystack)) return "desktop";
  return "system";
}

export function contextOptionPresentation(key: string): {
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

export function agentSkillDisplayName(label: string, key: string): string {
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

export function textListFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];
}

export function promptEntriesFromJson(value: string): string[] {
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

export function promptEntriesToJson(entries: string[]): string {
  return JSON.stringify(entries, null, 2);
}

export function stringifyJson(value: unknown, fallback = ""): string {
  if (value === undefined || value === null || value === "") return fallback;
  return JSON.stringify(value, null, 2);
}

export function parseJsonField(
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

export function normalizeModeForForm(value: unknown): string {
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

export function modePresentation(
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

export function visibilityPresentation(
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

export function iconFieldsFromValue(
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

export function buildIconValue(form: AgentFormState): unknown {
  if (form.iconKind === "image") return form.iconImage.trim() || undefined;
  if (form.iconKind === "builtin")
    return form.iconName.trim() ? { name: form.iconName.trim() } : undefined;
  return undefined;
}

export function optionLabel(item: Record<string, unknown>): string {
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

export function countListItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function readCount(value: unknown): number | undefined {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}

export function resolveFirstCount(...values: unknown[]): number {
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
  ref: MutableValueRef<boolean>,
): boolean {
  if (ref.current) return false;
  ref.current = true;
  return true;
}

export function resolveModelKey(
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

export function fallbackDefinition(
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

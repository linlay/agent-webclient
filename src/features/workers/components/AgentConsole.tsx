import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Input, Select, Spin } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/app/state/types";
import {
  createAgent,
  deleteAgent,
  getAdminAgentDetail,
  getAdminAgents,
  getAgentEditorOptions,
  getSkills,
  getTools,
  putAdminAgentOrder,
  updateAgent,
} from "@/features/transport/lib/apiClientProxy";
import type {
  AdminAgentDetailResponse,
  AdminAgentDiagnostic,
  AgentDetailResponse,
  AgentEditorOptionsResponse,
} from "@/shared/api/apiClient";
import {
  agentOrderPayload,
  filterAgentsPreservingOrder,
  moveAgentForDrop,
} from "@/features/workers/lib/agentOrdering";
import { AGENT_ICON_NAMES, AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n, type I18nContextValue } from "@/shared/i18n";

type AgentFormMode = "create" | "edit";
type IconKind = "none" | "builtin" | "image";
type Translate = I18nContextValue["t"];
type EditableAgentDetail = AgentDetailResponse | AdminAgentDetailResponse;

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
  tools: string[];
  skills: string[];
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
  embedded?: boolean;
}

export const AGENT_CONSOLE_ADMIN_LIST_ROUTE = "/api/admin/agents";

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
  tools: [],
  skills: [],
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

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function readAdminAgentStatus(value: unknown): string {
  return toText(asRecord(value).status).toLowerCase();
}

export function isInvalidAdminAgent(value: unknown): boolean {
  return readAdminAgentStatus(value) === "invalid";
}

export function readAdminAgentDiagnostics(value: unknown): AdminAgentDiagnostic[] {
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

export function hasEditableAdminDefinition(detail: EditableAgentDetail | null): boolean {
  if (!detail || !isInvalidAdminAgent(detail)) return true;
  return Boolean(detail.definition);
}

function resolveAdminAgentSourcePath(detail: EditableAgentDetail | null): string {
  if (!detail) return "";
  const source = asRecord(detail.source);
  return (
    toText(source.path)
    || toText(source.agentDir)
    || readAdminAgentDiagnostics(detail).map((item) => toText(item.sourcePath)).find(Boolean)
    || ""
  );
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
    if (!options.expectArray && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) {
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

function iconFieldsFromValue(value: unknown): Pick<AgentFormState, "iconKind" | "iconName" | "iconImage"> {
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
  if (form.iconKind === "builtin") return form.iconName.trim() ? { name: form.iconName.trim() } : undefined;
  return undefined;
}

function optionLabel(item: Record<string, unknown>): string {
  return toText(item.label) || toText(item.name) || toText(item.key);
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

export function buildAgentListSummary(agent: Agent, formFallback?: AgentFormState) {
  const meta = asRecord(agent.meta);
  const modelConfig = asRecord(agent.modelConfig);
  const toolConfig = asRecord(agent.toolConfig);
  const skillConfig = asRecord(agent.skillConfig);
  return {
    mode: formFallback?.mode || toText(meta.mode) || toText(agent.mode) || "--",
    modelKey:
      toText(meta.modelKey) ||
      toText(meta.model) ||
      toText(agent.modelKey) ||
      toText(modelConfig.modelKey) ||
      toText(agent.model) ||
      formFallback?.modelKey ||
      "--",
    toolsCount: resolveFirstCount(
      meta.toolsCount,
      meta.tools,
      toolConfig.tools,
      agent.tools,
      formFallback?.tools,
    ),
    skillsCount: resolveFirstCount(
      meta.skillsCount,
      meta.skills,
      skillConfig.skills,
      agent.skills,
      formFallback?.skills,
    ),
  };
}

export function shouldStartAgentConsoleBootstrap(ref: React.MutableRefObject<boolean>): boolean {
  if (ref.current) return false;
  ref.current = true;
  return true;
}

function resolveModelKey(detail: EditableAgentDetail, definition: Record<string, unknown>): string {
  const modelConfig = asRecord(definition.modelConfig);
  const meta = asRecord(detail.meta);
  return toText(modelConfig.modelKey) || toText(meta.modelKey) || toText(detail.model);
}

function fallbackDefinition(detail: EditableAgentDetail): Record<string, unknown> {
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
  const modelKey = toText(meta.modelKey) || toText(detail.model);
  if (modelKey) definition.modelConfig = { modelKey };
  if (Array.isArray(detail.tools)) definition.toolConfig = { tools: detail.tools };
  if (Array.isArray(detail.skills)) definition.skillConfig = { skills: detail.skills };
  if (Array.isArray(detail.wonders)) definition.wonders = detail.wonders;
  if (Array.isArray(detail.controls)) definition.controls = detail.controls;
  if (Array.isArray(visibility.scopes)) definition.visibility = { scopes: visibility.scopes };
  if (Object.keys(budget).length > 0) definition.budget = budget;
  return definition;
}

export function formFromDetail(detail: EditableAgentDetail): AgentFormState {
  const definition = detail.definition || fallbackDefinition(detail);
  const modelConfig = asRecord(definition.modelConfig);
  const toolConfig = asRecord(definition.toolConfig);
  const skillConfig = asRecord(definition.skillConfig);
  const contextConfig = asRecord(definition.contextConfig);
  const meta = asRecord(detail.meta);
  const definitionVisibility = asRecord(definition.visibility);
  const metaVisibility = asRecord(meta.visibility);
  const definitionBudget = asRecord(definition.budget);
  const metaBudget = asRecord(meta.budget);
  const budget = Object.keys(definitionBudget).length > 0 ? definitionBudget : metaBudget;
  return {
    key: toText(definition.key) || detail.key,
    name: toText(definition.name) || detail.name || detail.key,
    ...iconFieldsFromValue(definition.icon ?? detail.icon),
    role: toText(definition.role) || detail.role || "",
    description: toText(definition.description) || detail.description || "",
    mode: normalizeModeForForm(toText(definition.mode) || detail.mode || "REACT"),
    modelKey: toText(modelConfig.modelKey) || resolveModelKey(detail, definition),
    tools: textListFromUnknown(toolConfig.tools || detail.tools),
    skills: textListFromUnknown(skillConfig.skills || detail.skills),
    wonders: textListFromUnknown(definition.wonders || detail.wonders),
    contextTags: textListFromUnknown(contextConfig.tags || definition.contextTags),
    visibilityScopes: (() => {
      const definitionScopes = textListFromUnknown(definitionVisibility.scopes);
      if (definitionScopes.length > 0) return definitionScopes;
      const metaScopes = textListFromUnknown(metaVisibility.scopes);
      return metaScopes.length > 0 ? metaScopes : ["nav"];
    })(),
    budgetText: stringifyJson(budget),
    controlsText: stringifyJson(definition.controls || detail.controls || [], "[]"),
    runtimeConfigText: stringifyJson(definition.runtimeConfig),
    memoryConfigText: stringifyJson(definition.memoryConfig),
    proxyConfigText: stringifyJson(definition.proxyConfig),
    soulPrompt: detail.soulPrompt || "",
    agentsPrompt: detail.agentsPrompt || "",
  };
}

export function buildDefinition(form: AgentFormState, baseDefinition: Record<string, unknown>, t: Translate): Record<string, unknown> {
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
  if (modelKey) definition.modelConfig = { ...asRecord(definition.modelConfig), modelKey };
  else delete definition.modelConfig;

  const tools = form.tools.map((item) => item.trim()).filter(Boolean);
  if (tools.length > 0) definition.toolConfig = { ...asRecord(definition.toolConfig), tools };
  else delete definition.toolConfig;

  const skills = form.skills.map((item) => item.trim()).filter(Boolean);
  if (skills.length > 0) definition.skillConfig = { ...asRecord(definition.skillConfig), skills };
  else delete definition.skillConfig;

  const wonders = form.wonders.map((item) => item.trim()).filter(Boolean);
  if (wonders.length > 0) definition.wonders = wonders;
  else delete definition.wonders;

  const contextTags = form.contextTags.map((item) => item.trim()).filter(Boolean);
  if (contextTags.length > 0) {
    definition.contextConfig = { ...asRecord(definition.contextConfig), tags: contextTags };
    delete definition.contextTags;
  } else {
    const existingContextConfig = asRecord(definition.contextConfig);
    delete existingContextConfig.tags;
    if (Object.keys(existingContextConfig).length > 0) definition.contextConfig = existingContextConfig;
    else delete definition.contextConfig;
    delete definition.contextTags;
  }

  const visibilityScopes = form.visibilityScopes.map((item) => item.trim()).filter(Boolean);
  if (visibilityScopes.length > 0) {
    definition.visibility = { ...asRecord(definition.visibility), scopes: visibilityScopes };
  } else {
    delete definition.visibility;
  }

  const budget = parseJsonField("Budget", form.budgetText, t);
  if (budget === undefined) delete definition.budget;
  else definition.budget = budget;

  definition.controls = parseJsonField("Controls", form.controlsText, t, { expectArray: true });
  for (const [key, label, value] of [
    ["runtimeConfig", "Runtime Config", form.runtimeConfigText],
    ["memoryConfig", "Memory Config", form.memoryConfigText],
  ] as const) {
    const parsed = parseJsonField(label, value, t);
    if (parsed === undefined) delete definition[key];
    else definition[key] = parsed;
  }
  if (definition.mode === "PROXY") {
    definition.proxyConfig = parseJsonField("Proxy Config", form.proxyConfigText, t, { allowEmpty: false });
  } else {
    delete definition.proxyConfig;
  }
  return definition;
}

interface SortableAgentListItemProps {
  agent: Agent;
  agentKey: string;
  diagnosticMessage: string;
  disabled: boolean;
  isActive: boolean;
  isDragging: boolean;
  isInvalid: boolean;
  name: string;
  role: string;
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
  role,
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
      className={`agent-console-list-item ${isActive ? "is-active" : ""} ${isDragging ? "is-dragging" : ""} ${isInvalid ? "is-invalid" : ""}`}
      onClick={() => onSelect(agentKey)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(agentKey);
        }
      }}
    >
      <span
        ref={setActivatorNodeRef}
        className={`agent-console-list-item-icon ${disabled || !agentKey ? "" : "is-drag-handle"}`}
        aria-label={t("agentConsole.list.dragHandle", { name })}
        {...attributes}
        {...listeners}
      >
        <AgentIcon
          icon={agent.icon}
          type="agent"
          props={{
            icon: { width: 28, height: 28, className: "agent-console-list-item-svg" },
            avatar: { size: 28, icon: <MaterialIcon name="smart_toy" /> },
          }}
        />
      </span>
      <span className="agent-console-list-item-main">
        <span className="agent-console-list-item-row agent-console-list-item-head">
          <strong>{name}</strong>
          <span className="agent-console-list-item-head-meta">
            {isInvalid && (
              <span className="agent-console-status is-invalid">
                {t("agentConsole.status.invalid")}
              </span>
            )}
            <span>{agentKey || "--"}</span>
          </span>
        </span>
        <span className="agent-console-list-item-row agent-console-list-item-meta">
          <span>{role}</span>
          <span>{summary.mode}</span>
        </span>
        <span className="agent-console-list-item-row agent-console-list-item-meta">
          <span>{summary.modelKey}</span>
          <span>
            {t("agentConsole.list.toolsSkills", {
              tools: summary.toolsCount,
              skills: summary.skillsCount,
            })}
          </span>
        </span>
        {isInvalid && diagnosticMessage && (
          <span className="agent-console-list-item-diagnostic">
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
  embedded = false,
}) => {
  const { t } = useI18n();
  const { state, dispatch } = useAppContext();
  const [internalSelectedKey, setInternalSelectedKey] = useState("");
  const effectiveSelectedKey = selectedAgentKey || internalSelectedKey;
  const [searchText, setSearchText] = useState("");
  const [formMode, setFormMode] = useState<AgentFormMode>("create");
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [detail, setDetail] = useState<EditableAgentDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [editorOptions, setEditorOptions] = useState<AgentEditorOptionsResponse | null>(null);
  const [toolOptions, setToolOptions] = useState<Array<{ key: string; label: string }>>([]);
  const [skillOptions, setSkillOptions] = useState<Array<{ key: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDeleteKey, setPendingDeleteKey] = useState("");
  const [draggingAgentKey, setDraggingAgentKey] = useState("");
  const didInitialSelectRef = useRef(false);
  const didBootstrapAgentsRef = useRef(false);
  const didBootstrapOptionsRef = useRef(false);
  const listLoadSeqRef = useRef(0);
  const optionsLoadSeqRef = useRef(0);
  const selectedAgentKeyRef = useRef(selectedAgentKey);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filteredAgents = useMemo(() => {
    const agents = Array.isArray(state.agents) ? state.agents : [];
    return filterAgentsPreservingOrder(agents, searchText);
  }, [searchText, state.agents]);
  const filteredAgentSortableIds = useMemo(
    () => filteredAgents.map((agent, index) => toText(agent.key) || `agent-console-empty-${index}`),
    [filteredAgents],
  );

  const selectedSummary = useMemo(
    () => state.agents.find((agent) => toText(agent.key) === effectiveSelectedKey) || null,
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
    () => (editorOptions?.models || []).map((item) => {
      const name = String(item.name || "").trim();
      const key = String(item.key || "").trim();
      return { value: item.key, label: name || (item.modelId ? key + " · " + item.modelId : key) };
    }),
    [editorOptions],
  );
  const contextTagOptions = useMemo(
    () => (editorOptions?.contextTags || []).map((item) => ({ value: item.key, label: item.label || item.key })),
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
  const selectedIconValue = useMemo(() => {
    if (form.iconKind === "image") return form.iconImage;
    if (form.iconKind === "builtin" && form.iconName) return { name: form.iconName };
    return undefined;
  }, [form.iconImage, form.iconKind, form.iconName]);
  const detailDiagnostics = useMemo(() => readAdminAgentDiagnostics(detail), [detail]);
  const detailSourcePath = useMemo(() => resolveAdminAgentSourcePath(detail), [detail]);
  const canEditStructuredAgent = formMode === "create" || hasEditableAdminDefinition(detail);

  useEffect(() => {
    selectedAgentKeyRef.current = selectedAgentKey;
  }, [selectedAgentKey]);

  const selectAgent = useCallback(
    (agentKey: string) => {
      const key = agentKey.trim();
      setInternalSelectedKey(key);
      if (key) onSelectAgentKey?.(key);
    },
    [onSelectAgentKey],
  );

  const startCreate = useCallback(() => {
    setFormMode("create");
    setForm(EMPTY_FORM);
    setDetail(null);
    setInternalSelectedKey("");
    setFormError("");
    setError("");
    setPendingDeleteKey("");
    onClearSelection?.();
  }, [onClearSelection]);

  const loadAgents = useCallback(
    async (preferredKey = "") => {
      const requestSeq = listLoadSeqRef.current + 1;
      listLoadSeqRef.current = requestSeq;
      setLoadingList(true);
      setError("");
      try {
        const response = await getAdminAgents();
        if (listLoadSeqRef.current !== requestSeq) return;
        const agents = Array.isArray(response.data) ? (response.data as Agent[]) : [];
        dispatch({ type: "SET_AGENTS", agents });
        const normalizedPreferred = preferredKey.trim();
        const nextKey = normalizedPreferred && agents.some((agent) => toText(agent.key) === normalizedPreferred)
          ? normalizedPreferred
          : agents[0]?.key || "";
        if (!selectedAgentKeyRef.current && nextKey && !didInitialSelectRef.current) {
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

  const saveAgentOrder = useCallback(
    async (agents: Agent[], preferredKey = "") => {
      setSavingOrder(true);
      setError("");
      try {
        await saveAgentOrderRequest(agents);
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setSavingOrder(false);
      }
    },
    [],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingAgentKey(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const sourceKey = String(event.active.id);
      const targetKey = event.over ? String(event.over.id) : "";
      setDraggingAgentKey("");
      if (!sourceKey || !targetKey || sourceKey === targetKey || savingOrder) return;
      const nextAgents = moveAgentForDrop(state.agents, sourceKey, targetKey);
      if (nextAgents === state.agents) return;
      dispatch({ type: "SET_AGENTS", agents: nextAgents });
      await saveAgentOrder(nextAgents, sourceKey);
    },
    [dispatch, saveAgentOrder, savingOrder, state.agents],
  );

  const loadEditorOptions = useCallback(async () => {
    const requestSeq = optionsLoadSeqRef.current + 1;
    optionsLoadSeqRef.current = requestSeq;
    setLoadingOptions(true);
    try {
      const [optionsResponse, toolsResponse, skillsResponse] = await Promise.all([getAgentEditorOptions(), getTools(), getSkills()]);
      if (optionsLoadSeqRef.current !== requestSeq) return;
      setEditorOptions((optionsResponse.data || null) as AgentEditorOptionsResponse | null);
      setToolOptions(
        (Array.isArray(toolsResponse.data) ? toolsResponse.data : [])
          .map((item) => {
            const record = asRecord(item);
            const key = toText(record.key) || toText(record.name);
            return key ? { key, label: optionLabel(record) || key } : null;
          })
          .filter((item): item is { key: string; label: string } => Boolean(item)),
      );
      setSkillOptions(
        (Array.isArray(skillsResponse.data) ? skillsResponse.data : [])
          .map((item) => {
            const record = asRecord(item);
            const key = toText(record.key);
            return key ? { key, label: optionLabel(record) || key } : null;
          })
          .filter((item): item is { key: string; label: string } => Boolean(item)),
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
    setLoadingDetail(true);
    setError("");
    setFormError("");
    setPendingDeleteKey("");
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
      startCreate();
    }
  }, [effectiveSelectedKey, loadDetail, loadingList, startCreate, state.agents.length]);

  const updateForm = (patch: Partial<AgentFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setFormError("");
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
    setSaving(true);
    setError("");
    setFormError("");
    try {
      const baseDefinition = formMode === "edit" && detail ? detail.definition || fallbackDefinition(detail) : {};
      const definition = buildDefinition(form, baseDefinition, t);
      const response = formMode === "create"
        ? await createAgent({ key: form.key.trim(), definition, soulPrompt: form.soulPrompt, agentsPrompt: form.agentsPrompt })
        : await updateAgent({ key: form.key.trim(), definition, soulPrompt: form.soulPrompt, agentsPrompt: form.agentsPrompt });
      const saved = response.data;
      const savedKey = saved.key || form.key.trim();
      setDetail(saved);
      setForm(formFromDetail(saved));
      setFormMode("edit");
      await loadAgents(savedKey);
      selectAgent(savedKey);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const key = form.key.trim();
    if (!key || formMode !== "edit") return;
    if (pendingDeleteKey !== key) {
      setPendingDeleteKey(key);
      return;
    }
    setSaving(true);
    setError("");
    setFormError("");
    try {
      await deleteAgent({ key });
      const remaining = state.agents.filter((agent) => toText(agent.key) !== key);
      dispatch({ type: "SET_AGENTS", agents: remaining });
      const nextKey = remaining[0]?.key || "";
      if (nextKey) selectAgent(nextKey);
      else startCreate();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setMode = (mode: string) => {
    if (mode === "PROXY" && !form.proxyConfigText.trim()) {
      updateForm({
        mode,
        proxyConfigText: JSON.stringify({ baseUrl: "", timeoutMs: editorOptions?.proxyConfigSchema?.defaultTimeoutMs || 300000 }, null, 2),
      });
      return;
    }
    updateForm({ mode });
  };

  return (
    <div className={`command-modal-section agent-console ${embedded ? "is-embedded" : ""}`}>
      <div className="agent-console-toolbar">
        <Input
          prefix={<MaterialIcon name="search" style={{ color: "var(--text-muted)" }} />}
          variant="filled"
          placeholder={t("agentConsole.searchPlaceholder")}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <UiButton size="sm" variant="ghost" iconOnly onClick={() => loadAgents(effectiveSelectedKey)} disabled={loadingList || saving} aria-label={t("agentConsole.action.refresh")}>
          <MaterialIcon name="refresh" />
        </UiButton>
        <UiButton size="sm" variant="primary" onClick={startCreate}>
          <MaterialIcon name="add" />
          <span>{t("agentConsole.action.new")}</span>
        </UiButton>
      </div>

      {error && (
        <div className="agent-console-error">
          <span>{error}</span>
          <UiButton size="sm" variant="ghost" onClick={() => loadAgents()}>{t("agentConsole.action.retry")}</UiButton>
        </div>
      )}

      <div className="agent-console-body">
        <div className="agent-console-list">
          <div className="agent-console-count">
            <span>{t("agentConsole.list.count", { count: state.agents.length })}</span>
            {savingOrder && <span>{t("agentConsole.list.savingOrder")}</span>}
          </div>
          <Spin spinning={loadingList || savingOrder}>
            {filteredAgents.length === 0 ? (
              <div className="command-empty-state">
                {t("agentConsole.empty")}
                <UiButton size="sm" variant="primary" onClick={startCreate}>{t("agentConsole.action.create")}</UiButton>
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
                <SortableContext items={filteredAgentSortableIds} strategy={verticalListSortingStrategy}>
                  <div className="agent-console-list-items">
                    {filteredAgents.map((agent, index) => {
                      const agentKey = toText(agent.key);
                      const name = toText(agent.name) || agentKey;
                      const role = toText(agent.role) || "--";
                      const summary = buildAgentListSummary(agent, agentKey === form.key ? form : undefined);
                      const sortableId = agentKey || `agent-console-empty-${index}`;
                      const isInvalid = isInvalidAdminAgent(agent);
                      const diagnosticMessage = firstAdminAgentDiagnosticMessage(agent);
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
                          role={role}
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

        <div className="agent-console-detail">
          <Spin spinning={loadingDetail}>
            <div className="agent-detail-head">
              <div>
                <strong>{formMode === "create" ? t("agentConsole.detail.titleCreate") : selectedSummary?.name || form.name || form.key || t("agentConsole.detail.titleEdit")}</strong>
                <span>{formMode === "create" ? t("agentConsole.detail.createSubtitle") : detail?.source?.path || form.key}</span>
              </div>
              {formMode === "edit" && (
                <div className="agent-detail-actions">
                  <UiButton size="sm" variant="danger" onClick={confirmDelete} disabled={saving}>
                    <MaterialIcon name="delete" />
                    <span>{pendingDeleteKey === form.key ? t("agentConsole.action.confirmDelete") : t("agentConsole.action.delete")}</span>
                  </UiButton>
                </div>
              )}
            </div>

            {formMode === "edit" && (detailSourcePath || detailDiagnostics.length > 0) && (
              <div className="agent-detail-admin-meta">
                {detailSourcePath && (
                  <div className="agent-detail-source">
                    <span>{t("agentConsole.diagnostics.source")}</span>
                    <code>{detailSourcePath}</code>
                  </div>
                )}
                {detailDiagnostics.length > 0 && (
                  <div className="agent-diagnostics" role="status">
                    <strong>{t("agentConsole.diagnostics.title")}</strong>
                    {detailDiagnostics.map((diagnostic, index) => (
                      <div className="agent-diagnostic-item" key={`${diagnostic.code}-${index}`}>
                        <span className="agent-diagnostic-code">
                          {[diagnostic.severity, diagnostic.code].filter(Boolean).join(" · ")}
                        </span>
                        <span>{diagnostic.message}</span>
                        {diagnostic.sourcePath && <code>{diagnostic.sourcePath}</code>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canEditStructuredAgent ? (
              <>
                <div className="agent-form-grid">
              <div className="field-group">
                <label htmlFor="agent-key-input">Key</label>
                <Input id="agent-key-input" value={form.key} disabled={formMode === "edit"} onChange={(event) => updateForm({ key: event.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-name-input">{t("agentConsole.field.name")}</label>
                <Input id="agent-name-input" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-role-input">{t("agentConsole.field.role")}</label>
                <Input id="agent-role-input" value={form.role} onChange={(event) => updateForm({ role: event.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-mode-input">{t("agentConsole.field.mode")}</label>
                <Select id="agent-mode-input" value={form.mode} options={modeOptions} onChange={setMode} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-model-input">Model Key</label>
                <Select id="agent-model-input" showSearch allowClear loading={loadingOptions} value={form.modelKey || undefined} options={modelOptions} optionFilterProp="label" onChange={(value) => updateForm({ modelKey: value || "" })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-tags-input">Context Tags</label>
                <Select id="agent-tags-input" mode="multiple" allowClear loading={loadingOptions} value={form.contextTags} options={contextTagOptions} onChange={(value) => updateForm({ contextTags: value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-icon-kind-input">Icon</label>
                <div className="agent-icon-editor">
                  <span className="agent-icon-preview"><AgentIcon icon={selectedIconValue as any} type="agent" /></span>
                  <Select
                    id="agent-icon-kind-input"
                    value={form.iconKind}
                    options={[
                      { value: "none", label: "Default" },
                      { value: "builtin", label: "Built-in" },
                      { value: "image", label: "JPG / PNG / SVG" },
                    ]}
                    onChange={(value: IconKind) => updateForm({ iconKind: value })}
                  />
                </div>
              </div>
              {form.iconKind === "builtin" && (
                <div className="field-group">
                  <label htmlFor="agent-icon-name-input">Icon Name</label>
                  <Select id="agent-icon-name-input" showSearch allowClear value={form.iconName || undefined} options={AGENT_ICON_NAMES.map((name) => ({ value: name, label: name }))} onChange={(value) => updateForm({ iconName: value || "" })} />
                </div>
              )}
              {form.iconKind === "image" && (
                <div className="field-group">
                  <label htmlFor="agent-icon-image-input">Icon Image</label>
                  <Input id="agent-icon-image-input" placeholder={t("agentConsole.placeholder.iconImage")} value={form.iconImage} onChange={(event) => updateForm({ iconImage: event.target.value })} />
                </div>
              )}
            </div>

            <div className="field-group">
              <label htmlFor="agent-description-input">{t("agentConsole.field.description")}</label>
              <Input.TextArea id="agent-description-input" rows={3} value={form.description} onChange={(event) => updateForm({ description: event.target.value })} />
            </div>

            <fieldset className="agent-config-box">
              <legend>{t("agentConsole.section.capabilities")}</legend>
              <div className="agent-form-grid">
                <div className="field-group">
                  <label htmlFor="agent-tools-input">Tools</label>
                  <Select
                    id="agent-tools-input"
                    mode="multiple"
                    showSearch
                    allowClear
                    loading={loadingOptions}
                    value={form.tools}
                    options={toolOptions.map((item) => ({ value: item.key, label: `${item.label}${item.label === item.key ? "" : ` · ${item.key}`}` }))}
                    optionFilterProp="label"
                    onChange={(value) => updateForm({ tools: value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-skills-input">Skills</label>
                  <Select
                    id="agent-skills-input"
                    mode="multiple"
                    showSearch
                    allowClear
                    loading={loadingOptions}
                    value={form.skills}
                    options={skillOptions.map((item) => ({ value: item.key, label: `${item.label}${item.label === item.key ? "" : ` · ${item.key}`}` }))}
                    optionFilterProp="label"
                    onChange={(value) => updateForm({ skills: value })}
                  />
                </div>
              </div>
              <div className="field-group">
                <label>Wonders</label>
                <div className="agent-wonders-editor">
                  {(form.wonders.length > 0 ? form.wonders : [""]).map((wonder, index) => (
                    <div className="agent-wonder-row" key={index}>
                      <Input
                        value={wonder}
                        onChange={(event) => {
                          const next = form.wonders.length > 0 ? [...form.wonders] : [""];
                          next[index] = event.target.value;
                          updateForm({ wonders: next });
                        }}
                      />
                      <UiButton size="sm" variant="ghost" iconOnly aria-label={t("agentConsole.wonders.remove")} onClick={() => updateForm({ wonders: form.wonders.filter((_, itemIndex) => itemIndex !== index) })}>
                        <MaterialIcon name="close" />
                      </UiButton>
                    </div>
                  ))}
                  <UiButton size="sm" variant="ghost" onClick={() => updateForm({ wonders: [...form.wonders, ""] })}>
                    <MaterialIcon name="add" />
                    <span>{t("agentConsole.action.add")}</span>
                  </UiButton>
                </div>
              </div>
            </fieldset>

            <fieldset className="agent-config-box">
              <legend>{t("agentConsole.section.advancedConfig")}</legend>
              <div className="agent-form-grid">
                <div className="field-group">
                  <label htmlFor="agent-controls-input">Controls</label>
                  <Input.TextArea id="agent-controls-input" className="settings-textarea agent-mono-textarea" rows={5} value={form.controlsText} onChange={(event) => updateForm({ controlsText: event.target.value })} />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-runtime-input">Runtime Config</label>
                  <Input.TextArea id="agent-runtime-input" className="settings-textarea agent-mono-textarea" rows={5} placeholder='{"environmentId":"shell","level":"RUN"}' value={form.runtimeConfigText} onChange={(event) => updateForm({ runtimeConfigText: event.target.value })} />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-memory-input">Memory Config</label>
                  <Input.TextArea id="agent-memory-input" className="settings-textarea agent-mono-textarea" rows={5} value={form.memoryConfigText} onChange={(event) => updateForm({ memoryConfigText: event.target.value })} />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-visibility-input">Visibility</label>
                  <Select
                    id="agent-visibility-input"
                    mode="multiple"
                    allowClear
                    loading={loadingOptions}
                    value={form.visibilityScopes}
                    options={visibilityScopeOptions}
                    onChange={(value) => updateForm({ visibilityScopes: value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-budget-input">Budget</label>
                  <Input.TextArea id="agent-budget-input" className="settings-textarea agent-mono-textarea" rows={7} placeholder={BUDGET_PLACEHOLDER} value={form.budgetText} onChange={(event) => updateForm({ budgetText: event.target.value })} />
                </div>
                {form.mode === "PROXY" && (
                  <div className="field-group">
                    <label htmlFor="agent-proxy-input">ACP-PROXY Config</label>
                    <Input.TextArea id="agent-proxy-input" className="settings-textarea agent-mono-textarea" rows={5} placeholder='{"baseUrl":"http://127.0.0.1:3210","timeoutMs":300000}' value={form.proxyConfigText} onChange={(event) => updateForm({ proxyConfigText: event.target.value })} />
                  </div>
                )}
              </div>
            </fieldset>

            <fieldset className="agent-config-box">
              <legend>Prompt</legend>
              <div className="field-group">
                <label htmlFor="agent-soul-input">SOUL.md</label>
                <Input.TextArea id="agent-soul-input" className="settings-textarea agent-prompt-textarea" rows={5} value={form.soulPrompt} onChange={(event) => updateForm({ soulPrompt: event.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-agents-input">AGENTS.md</label>
                <Input.TextArea id="agent-agents-input" className="settings-textarea agent-prompt-textarea" rows={5} value={form.agentsPrompt} onChange={(event) => updateForm({ agentsPrompt: event.target.value })} />
              </div>
            </fieldset>
              </>
            ) : (
              <div className="agent-console-uneditable">
                <MaterialIcon name="warning" />
                <span>{t("agentConsole.diagnostics.uneditable")}</span>
              </div>
            )}

            {formError && <div className="settings-error">{formError}</div>}

            <div className="agent-save-actions">
              <UiButton size="sm" variant="primary" onClick={saveForm} disabled={saving || !canEditStructuredAgent}>
                <MaterialIcon name="save" />
                <span>{formMode === "create" ? t("agentConsole.action.create") : t("agentConsole.action.saveChanges")}</span>
              </UiButton>
              {formMode === "edit" && (
                <UiButton size="sm" variant="ghost" onClick={startCreate} disabled={saving}>
                  {t("agentConsole.action.cancelEdit")}
                </UiButton>
              )}
            </div>
          </Spin>
        </div>
      </div>
    </div>
  );
};

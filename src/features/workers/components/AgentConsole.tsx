import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Select, Spin } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/app/state/types";
import {
  createAgent,
  deleteAgent,
  getAgent,
  getAgentEditorOptions,
  getAgents,
  getSkills,
  getTools,
  updateAgent,
} from "@/features/transport/lib/apiClientProxy";
import type {
  AgentDetailResponse,
  AgentEditorOptionsResponse,
} from "@/shared/api/apiClient";
import { AGENT_ICON_NAMES, AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

type AgentFormMode = "create" | "edit";
type IconKind = "none" | "builtin" | "image";

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
  controlsText: "[]",
  runtimeConfigText: "",
  memoryConfigText: "",
  proxyConfigText: "",
  soulPrompt: "",
  agentsPrompt: "",
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
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
  options: { allowEmpty?: boolean; expectArray?: boolean } = {},
): unknown {
  const raw = value.trim();
  if (!raw && options.allowEmpty !== false) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (options.expectArray && !Array.isArray(parsed)) {
      throw new Error(`${label} 必须是 JSON 数组。`);
    }
    if (!options.expectArray && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) {
      throw new Error(`${label} 必须是 JSON 对象。`);
    }
    return parsed;
  } catch (error) {
    const message = (error as Error).message;
    throw new Error(message.startsWith(label) ? message : `${label} JSON 无效：${message}`);
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

function resolveFirstListItemCount(...values: unknown[]): number {
  const matched = values.find((value) => Array.isArray(value));
  return countListItems(matched);
}

function buildAgentListSummary(agent: Agent, detailFallback?: AgentDetailResponse | null, formFallback?: AgentFormState) {
  const definition = asRecord(agent.definition);
  const detailDefinition = asRecord(detailFallback?.definition);
  const meta = asRecord(agent.meta);
  const detailMeta = asRecord(detailFallback?.meta);
  const modelConfig = asRecord(agent.modelConfig);
  const definitionModelConfig = asRecord(definition.modelConfig);
  const detailDefinitionModelConfig = asRecord(detailDefinition.modelConfig);
  const toolConfig = asRecord(agent.toolConfig);
  const definitionToolConfig = asRecord(definition.toolConfig);
  const detailDefinitionToolConfig = asRecord(detailDefinition.toolConfig);
  const skillConfig = asRecord(agent.skillConfig);
  const definitionSkillConfig = asRecord(definition.skillConfig);
  const detailDefinitionSkillConfig = asRecord(detailDefinition.skillConfig);
  return {
    mode: toText(agent.mode) || toText(definition.mode) || toText(detailFallback?.mode) || toText(detailDefinition.mode) || formFallback?.mode || "--",
    modelKey:
      toText(agent.modelKey) ||
      toText(meta.modelKey) ||
      toText(modelConfig.modelKey) ||
      toText(definitionModelConfig.modelKey) ||
      toText(detailMeta.modelKey) ||
      toText(detailDefinitionModelConfig.modelKey) ||
      toText(detailFallback?.model) ||
      toText(agent.model) ||
      formFallback?.modelKey ||
      "--",
    toolsCount: resolveFirstListItemCount(
      agent.tools,
      toolConfig.tools,
      definitionToolConfig.tools,
      detailFallback?.tools,
      detailDefinitionToolConfig.tools,
      formFallback?.tools,
    ),
    skillsCount: resolveFirstListItemCount(
      agent.skills,
      skillConfig.skills,
      definitionSkillConfig.skills,
      detailFallback?.skills,
      detailDefinitionSkillConfig.skills,
      formFallback?.skills,
    ),
  };
}

function resolveModelKey(detail: AgentDetailResponse, definition: Record<string, unknown>): string {
  const modelConfig = asRecord(definition.modelConfig);
  const meta = asRecord(detail.meta);
  return toText(modelConfig.modelKey) || toText(meta.modelKey) || toText(detail.model);
}

function fallbackDefinition(detail: AgentDetailResponse): Record<string, unknown> {
  const definition: Record<string, unknown> = {
    key: detail.key,
    name: detail.name,
    icon: detail.icon,
    role: detail.role || "",
    description: detail.description || "",
    mode: normalizeModeForForm(detail.mode),
  };
  const meta = asRecord(detail.meta);
  const modelKey = toText(meta.modelKey) || toText(detail.model);
  if (modelKey) definition.modelConfig = { modelKey };
  if (Array.isArray(detail.tools)) definition.toolConfig = { tools: detail.tools };
  if (Array.isArray(detail.skills)) definition.skillConfig = { skills: detail.skills };
  if (Array.isArray(detail.wonders)) definition.wonders = detail.wonders;
  if (Array.isArray(detail.controls)) definition.controls = detail.controls;
  return definition;
}

function formFromDetail(detail: AgentDetailResponse): AgentFormState {
  const definition = detail.definition || fallbackDefinition(detail);
  const modelConfig = asRecord(definition.modelConfig);
  const toolConfig = asRecord(definition.toolConfig);
  const skillConfig = asRecord(definition.skillConfig);
  const contextConfig = asRecord(definition.contextConfig);
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
    controlsText: stringifyJson(definition.controls || detail.controls || [], "[]"),
    runtimeConfigText: stringifyJson(definition.runtimeConfig),
    memoryConfigText: stringifyJson(definition.memoryConfig),
    proxyConfigText: stringifyJson(definition.proxyConfig),
    soulPrompt: detail.soulPrompt || "",
    agentsPrompt: detail.agentsPrompt || "",
  };
}

function buildDefinition(form: AgentFormState, baseDefinition: Record<string, unknown>): Record<string, unknown> {
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

  definition.controls = parseJsonField("Controls", form.controlsText, { expectArray: true });
  for (const [key, label, value] of [
    ["runtimeConfig", "Runtime Config", form.runtimeConfigText],
    ["memoryConfig", "Memory Config", form.memoryConfigText],
  ] as const) {
    const parsed = parseJsonField(label, value);
    if (parsed === undefined) delete definition[key];
    else definition[key] = parsed;
  }
  if (definition.mode === "PROXY") {
    definition.proxyConfig = parseJsonField("Proxy Config", form.proxyConfigText, { allowEmpty: false });
  } else {
    delete definition.proxyConfig;
  }
  return definition;
}

function buildAgentSearchText(agent: Agent): string {
  return [agent.key, agent.name, agent.role, agent.description, ...(Array.isArray(agent.wonders) ? agent.wonders : [])]
    .map((item) => toText(item).toLowerCase())
    .join(" ");
}

function compareAgents(a: Agent, b: Agent): number {
  return (toText(a.name) || toText(a.key)).localeCompare(toText(b.name) || toText(b.key));
}

export const AgentConsole: React.FC<AgentConsoleProps> = ({
  selectedAgentKey = "",
  onSelectAgentKey,
  onClearSelection,
  embedded = false,
}) => {
  const { state, dispatch } = useAppContext();
  const [internalSelectedKey, setInternalSelectedKey] = useState("");
  const effectiveSelectedKey = selectedAgentKey || internalSelectedKey;
  const [searchText, setSearchText] = useState("");
  const [formMode, setFormMode] = useState<AgentFormMode>("create");
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [detail, setDetail] = useState<AgentDetailResponse | null>(null);
  const [listDetailsByKey, setListDetailsByKey] = useState<Record<string, AgentDetailResponse>>({});
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [editorOptions, setEditorOptions] = useState<AgentEditorOptionsResponse | null>(null);
  const [toolOptions, setToolOptions] = useState<Array<{ key: string; label: string }>>([]);
  const [skillOptions, setSkillOptions] = useState<Array<{ key: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDeleteKey, setPendingDeleteKey] = useState("");
  const didInitialSelectRef = useRef(false);

  const filteredAgents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const agents = Array.isArray(state.agents) ? state.agents : [];
    return agents.filter((agent) => !query || buildAgentSearchText(agent).includes(query)).slice().sort(compareAgents);
  }, [searchText, state.agents]);

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
  const selectedIconValue = useMemo(() => {
    if (form.iconKind === "image") return form.iconImage;
    if (form.iconKind === "builtin" && form.iconName) return { name: form.iconName };
    return undefined;
  }, [form.iconImage, form.iconKind, form.iconName]);

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
      setLoadingList(true);
      setError("");
      try {
        const response = await getAgents({ scope: "nav" });
        const agents = Array.isArray(response.data) ? (response.data as Agent[]) : [];
        dispatch({ type: "SET_AGENTS", agents });
        const detailResults = await Promise.allSettled(
          agents
            .map((agent) => toText(agent.key))
            .filter(Boolean)
            .map(async (key) => {
              const detailResponse = await getAgent(key);
              return [key, detailResponse.data as AgentDetailResponse] as const;
            }),
        );
        const nextDetailsByKey: Record<string, AgentDetailResponse> = {};
        for (const result of detailResults) {
          if (result.status === "fulfilled") {
            nextDetailsByKey[result.value[0]] = result.value[1];
          }
        }
        setListDetailsByKey(nextDetailsByKey);
        const normalizedPreferred = preferredKey.trim();
        const nextKey = normalizedPreferred && agents.some((agent) => toText(agent.key) === normalizedPreferred)
          ? normalizedPreferred
          : agents[0]?.key || "";
        if (!selectedAgentKey && nextKey && !didInitialSelectRef.current) {
          didInitialSelectRef.current = true;
          setInternalSelectedKey(nextKey);
        }
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setLoadingList(false);
      }
    },
    [dispatch, selectedAgentKey],
  );

  const loadEditorOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [optionsResponse, toolsResponse, skillsResponse] = await Promise.all([getAgentEditorOptions(), getTools(), getSkills()]);
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
      setError((error as Error).message);
    } finally {
      setLoadingOptions(false);
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
      const response = await getAgent(key);
      const nextDetail = response.data as AgentDetailResponse;
      setDetail(nextDetail);
      setListDetailsByKey((current) => ({ ...current, [key]: nextDetail }));
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
    void loadAgents(selectedAgentKey);
  }, [loadAgents, selectedAgentKey]);

  useEffect(() => {
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
    if (!form.key.trim()) {
      setFormError("请填写 Agent Key。");
      return;
    }
    if (!form.name.trim()) {
      setFormError("请填写名称。");
      return;
    }
    setSaving(true);
    setError("");
    setFormError("");
    try {
      const baseDefinition = formMode === "edit" && detail ? detail.definition || fallbackDefinition(detail) : {};
      const definition = buildDefinition(form, baseDefinition);
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
          placeholder="搜索智能体..."
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <UiButton size="sm" variant="ghost" iconOnly onClick={() => loadAgents(effectiveSelectedKey)} disabled={loadingList || saving} aria-label="刷新智能体">
          <MaterialIcon name="refresh" />
        </UiButton>
        <UiButton size="sm" variant="primary" onClick={startCreate}>
          <MaterialIcon name="add" />
          <span>新建</span>
        </UiButton>
      </div>

      {error && (
        <div className="agent-console-error">
          <span>{error}</span>
          <UiButton size="sm" variant="ghost" onClick={() => loadAgents()}>重试</UiButton>
        </div>
      )}

      <div className="agent-console-body">
        <div className="agent-console-list">
          <div className="agent-console-count">智能体 {state.agents.length} 个</div>
          <Spin spinning={loadingList}>
            {filteredAgents.length === 0 ? (
              <div className="command-empty-state">
                暂无匹配智能体。
                <UiButton size="sm" variant="primary" onClick={startCreate}>新建智能体</UiButton>
              </div>
            ) : (
              <div className="agent-console-list-items">
                {filteredAgents.map((agent, index) => {
                  const agentKey = toText(agent.key);
                  const name = toText(agent.name) || agentKey;
                  const role = toText(agent.role) || "--";
                  const listDetail = agentKey ? listDetailsByKey[agentKey] || null : null;
                  const summary = buildAgentListSummary(agent, listDetail, agentKey === form.key ? form : undefined);
                  return (
                    <button
                      type="button"
                      key={agentKey || `${name}-${index}`}
                      className={`agent-console-list-item ${agentKey === effectiveSelectedKey ? "is-active" : ""}`}
                      onClick={() => selectAgent(agentKey)}
                    >
                      <span className="agent-console-list-item-icon">
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
                          <span>{agentKey || "--"}</span>
                        </span>
                        <span className="agent-console-list-item-row agent-console-list-item-meta">
                          <span>{role}</span>
                          <span>{summary.mode}</span>
                        </span>
                        <span className="agent-console-list-item-row agent-console-list-item-meta">
                          <span>{summary.modelKey}</span>
                          <span>工具 {summary.toolsCount} · 技能 {summary.skillsCount}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Spin>
        </div>

        <div className="agent-console-detail">
          <Spin spinning={loadingDetail}>
            <div className="agent-detail-head">
              <div>
                <strong>{formMode === "create" ? "新建智能体" : selectedSummary?.name || form.name || form.key || "编辑智能体"}</strong>
                <span>{formMode === "create" ? "保存后写入后端 agent 配置" : detail?.source?.path || form.key}</span>
              </div>
              {formMode === "edit" && (
                <div className="agent-detail-actions">
                  <UiButton size="sm" variant="danger" onClick={confirmDelete} disabled={saving}>
                    <MaterialIcon name="delete" />
                    <span>{pendingDeleteKey === form.key ? "确认删除" : "删除"}</span>
                  </UiButton>
                </div>
              )}
            </div>

            <div className="agent-form-grid">
              <div className="field-group">
                <label htmlFor="agent-key-input">Key</label>
                <Input id="agent-key-input" value={form.key} disabled={formMode === "edit"} onChange={(event) => updateForm({ key: event.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-name-input">名称</label>
                <Input id="agent-name-input" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-role-input">角色</label>
                <Input id="agent-role-input" value={form.role} onChange={(event) => updateForm({ role: event.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="agent-mode-input">模式</label>
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
                      { value: "image", label: "JPG / PNG" },
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
                  <Input id="agent-icon-image-input" placeholder="/assets/agent.png 或 https://..." value={form.iconImage} onChange={(event) => updateForm({ iconImage: event.target.value })} />
                </div>
              )}
            </div>

            <div className="field-group">
              <label htmlFor="agent-description-input">描述</label>
              <Input.TextArea id="agent-description-input" rows={3} value={form.description} onChange={(event) => updateForm({ description: event.target.value })} />
            </div>

            <fieldset className="agent-config-box">
              <legend>能力</legend>
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
                      <UiButton size="sm" variant="ghost" iconOnly aria-label="删除推荐问题" onClick={() => updateForm({ wonders: form.wonders.filter((_, itemIndex) => itemIndex !== index) })}>
                        <MaterialIcon name="close" />
                      </UiButton>
                    </div>
                  ))}
                  <UiButton size="sm" variant="ghost" onClick={() => updateForm({ wonders: [...form.wonders, ""] })}>
                    <MaterialIcon name="add" />
                    <span>添加</span>
                  </UiButton>
                </div>
              </div>
            </fieldset>

            <fieldset className="agent-config-box">
              <legend>高级配置</legend>
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

            {formError && <div className="settings-error">{formError}</div>}

            <div className="agent-save-actions">
              <UiButton size="sm" variant="primary" onClick={saveForm} disabled={saving}>
                <MaterialIcon name="save" />
                <span>{formMode === "create" ? "创建智能体" : "保存修改"}</span>
              </UiButton>
              {formMode === "edit" && (
                <UiButton size="sm" variant="ghost" onClick={startCreate} disabled={saving}>
                  取消编辑
                </UiButton>
              )}
            </div>
          </Spin>
        </div>
      </div>
    </div>
  );
};

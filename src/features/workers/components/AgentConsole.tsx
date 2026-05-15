import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Spin } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/app/state/types";
import {
  createAgent,
  deleteAgent,
  getAgent,
  getAgents,
  updateAgent,
} from "@/features/transport/lib/apiClientProxy";
import type { AgentDetailResponse } from "@/shared/api/apiClient";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiInput } from "@/shared/ui/UiInput";
import { UiTag } from "@/shared/ui/UiTag";

type AgentFormMode = "create" | "edit";

interface AgentFormState {
  key: string;
  name: string;
  role: string;
  description: string;
  mode: string;
  modelKey: string;
  toolsText: string;
  skillsText: string;
  wondersText: string;
  contextTagsText: string;
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
  role: "",
  description: "",
  mode: "REACT",
  modelKey: "",
  toolsText: "",
  skillsText: "",
  wondersText: "",
  contextTagsText: "",
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

function listToText(value: unknown): string {
  return textListFromUnknown(value).join("\n");
}

function textToList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function resolveModelKey(detail: AgentDetailResponse, definition: Record<string, unknown>): string {
  const modelConfig = asRecord(definition.modelConfig);
  const meta = asRecord(detail.meta);
  return toText(modelConfig.modelKey) || toText(meta.modelKey) || toText(detail.model);
}

function fallbackDefinition(detail: AgentDetailResponse): Record<string, unknown> {
  const definition: Record<string, unknown> = {
    key: detail.key,
    name: detail.name,
    role: detail.role || "",
    description: detail.description || "",
    mode: detail.mode || "REACT",
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
    role: toText(definition.role) || detail.role || "",
    description: toText(definition.description) || detail.description || "",
    mode: toText(definition.mode) || detail.mode || "REACT",
    modelKey: toText(modelConfig.modelKey) || resolveModelKey(detail, definition),
    toolsText: listToText(toolConfig.tools || detail.tools),
    skillsText: listToText(skillConfig.skills || detail.skills),
    wondersText: listToText(definition.wonders || detail.wonders),
    contextTagsText: listToText(contextConfig.tags || definition.contextTags),
    controlsText: stringifyJson(definition.controls || detail.controls || [], "[]"),
    runtimeConfigText: stringifyJson(definition.runtimeConfig),
    memoryConfigText: stringifyJson(definition.memoryConfig),
    proxyConfigText: stringifyJson(definition.proxyConfig),
    soulPrompt: detail.soulPrompt || "",
    agentsPrompt: detail.agentsPrompt || "",
  };
}

function buildDefinition(
  form: AgentFormState,
  baseDefinition: Record<string, unknown>,
): Record<string, unknown> {
  const definition = { ...baseDefinition };
  definition.key = form.key.trim();
  definition.name = form.name.trim();
  definition.role = form.role.trim();
  definition.description = form.description.trim();
  definition.mode = form.mode.trim() || "REACT";

  const modelKey = form.modelKey.trim();
  if (modelKey) {
    definition.modelConfig = { ...asRecord(definition.modelConfig), modelKey };
  } else {
    delete definition.modelConfig;
  }

  const tools = textToList(form.toolsText);
  if (tools.length > 0) definition.toolConfig = { ...asRecord(definition.toolConfig), tools };
  else delete definition.toolConfig;

  const skills = textToList(form.skillsText);
  if (skills.length > 0) definition.skillConfig = { ...asRecord(definition.skillConfig), skills };
  else delete definition.skillConfig;

  const wonders = textToList(form.wondersText);
  if (wonders.length > 0) definition.wonders = wonders;
  else delete definition.wonders;

  const contextTags = textToList(form.contextTagsText);
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

  const controls = parseJsonField("Controls", form.controlsText, {
    expectArray: true,
  });
  definition.controls = controls;

  for (const [key, label, value] of [
    ["runtimeConfig", "Runtime Config", form.runtimeConfigText],
    ["memoryConfig", "Memory Config", form.memoryConfigText],
    ["proxyConfig", "Proxy Config", form.proxyConfigText],
  ] as const) {
    const parsed = parseJsonField(label, value);
    if (parsed === undefined) delete definition[key];
    else definition[key] = parsed;
  }

  return definition;
}

function buildAgentSearchText(agent: Agent): string {
  return [
    agent.key,
    agent.name,
    agent.role,
    agent.description,
    ...(Array.isArray(agent.wonders) ? agent.wonders : []),
  ]
    .map((item) => toText(item).toLowerCase())
    .join(" ");
}

function compareAgents(a: Agent, b: Agent): number {
  return (toText(a.name) || toText(a.key)).localeCompare(
    toText(b.name) || toText(b.key),
  );
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
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDeleteKey, setPendingDeleteKey] = useState("");
  const didInitialSelectRef = useRef(false);

  const filteredAgents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const agents = Array.isArray(state.agents) ? state.agents : [];
    return agents
      .filter((agent) => !query || buildAgentSearchText(agent).includes(query))
      .slice()
      .sort(compareAgents);
  }, [searchText, state.agents]);

  const selectedSummary = useMemo(
    () =>
      state.agents.find((agent) => toText(agent.key) === effectiveSelectedKey) ||
      null,
    [effectiveSelectedKey, state.agents],
  );

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
        const response = await getAgents();
        const agents = Array.isArray(response.data)
          ? (response.data as Agent[])
          : [];
        dispatch({ type: "SET_AGENTS", agents });
        const normalizedPreferred = preferredKey.trim();
        const nextKey =
          normalizedPreferred && agents.some((agent) => toText(agent.key) === normalizedPreferred)
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
    if (selectedAgentKey) {
      setInternalSelectedKey(selectedAgentKey);
    }
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
      const baseDefinition =
        formMode === "edit" && detail
          ? detail.definition || fallbackDefinition(detail)
          : {};
      const definition = buildDefinition(form, baseDefinition);
      const payload = {
        key: form.key.trim(),
        definition,
        soulPrompt: form.soulPrompt,
        agentsPrompt: form.agentsPrompt,
      };
      const response =
        formMode === "create"
          ? await createAgent(payload)
          : await updateAgent(payload);
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
      if (nextKey) {
        selectAgent(nextKey);
      } else {
        startCreate();
      }
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`command-modal-section agent-console ${embedded ? "is-embedded" : ""}`}>
      <div className="agent-console-toolbar">
        <Input
          prefix={
            <MaterialIcon
              name="search"
              style={{ color: "var(--text-muted)" }}
            />
          }
          variant="filled"
          placeholder="搜索智能体..."
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <UiButton
          size="sm"
          variant="ghost"
          iconOnly
          onClick={() => loadAgents(effectiveSelectedKey)}
          disabled={loadingList || saving}
          aria-label="刷新智能体"
        >
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
          <UiButton size="sm" variant="ghost" onClick={() => loadAgents()}>
            重试
          </UiButton>
        </div>
      )}

      <div className="agent-console-body">
        <div className="agent-console-list">
          <div className="agent-console-count">
            智能体 {state.agents.length} 个
          </div>
          <Spin spinning={loadingList}>
            {filteredAgents.length === 0 ? (
              <div className="command-empty-state">
                暂无匹配智能体。
                <UiButton size="sm" variant="primary" onClick={startCreate}>
                  新建智能体
                </UiButton>
              </div>
            ) : (
              <div className="agent-console-list-items">
                {filteredAgents.map((agent, index) => {
                  const agentKey = toText(agent.key);
                  const name = toText(agent.name) || agentKey;
                  const role = toText(agent.role) || "--";
                  return (
                    <button
                      type="button"
                      key={agentKey || `${name}-${index}`}
                      className={`agent-console-list-item ${agentKey === effectiveSelectedKey ? "is-active" : ""}`}
                      onClick={() => selectAgent(agentKey)}
                    >
                      <span className="agent-console-list-item-icon">
                        <MaterialIcon name="smart_toy" />
                      </span>
                      <span className="agent-console-list-item-main">
                        <span className="agent-console-list-item-head">
                          <strong>{name}</strong>
                          {agent?.stats?.unreadCount ? (
                            <UiTag tone="accent">{agent.stats.unreadCount} 未读</UiTag>
                          ) : null}
                        </span>
                        <span className="agent-console-list-item-meta">
                          {role}
                          {agentKey ? ` · ${agentKey}` : ""}
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
                <strong>
                  {formMode === "create"
                    ? "新建智能体"
                    : selectedSummary?.name || form.name || form.key || "编辑智能体"}
                </strong>
                <span>
                  {formMode === "create"
                    ? "保存后写入后端 agent 配置"
                    : detail?.source?.path || form.key}
                </span>
              </div>
              {formMode === "edit" && (
                <div className="agent-detail-actions">
                  <UiButton
                    size="sm"
                    variant="danger"
                    onClick={confirmDelete}
                    disabled={saving}
                  >
                    <MaterialIcon name="delete" />
                    <span>{pendingDeleteKey === form.key ? "确认删除" : "删除"}</span>
                  </UiButton>
                </div>
              )}
            </div>

            <div className="agent-form-grid">
              <div className="field-group">
                <label htmlFor="agent-key-input">Key</label>
                <UiInput
                  id="agent-key-input"
                  inputSize="md"
                  value={form.key}
                  disabled={formMode === "edit"}
                  onChange={(event) => updateForm({ key: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="agent-name-input">名称</label>
                <UiInput
                  id="agent-name-input"
                  inputSize="md"
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="agent-role-input">角色</label>
                <UiInput
                  id="agent-role-input"
                  inputSize="md"
                  value={form.role}
                  onChange={(event) => updateForm({ role: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="agent-mode-input">模式</label>
                <select
                  id="agent-mode-input"
                  value={form.mode}
                  onChange={(event) => updateForm({ mode: event.target.value })}
                >
                  <option value="REACT">REACT</option>
                  <option value="ONESHOT">ONESHOT</option>
                  <option value="PLAN_EXECUTE">PLAN_EXECUTE</option>
                  <option value="PROXY">PROXY</option>
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="agent-model-input">Model Key</label>
                <UiInput
                  id="agent-model-input"
                  inputSize="md"
                  value={form.modelKey}
                  onChange={(event) => updateForm({ modelKey: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="agent-tags-input">Context Tags</label>
                <UiInput
                  id="agent-tags-input"
                  inputSize="md"
                  placeholder="system, session, owner"
                  value={form.contextTagsText}
                  onChange={(event) => updateForm({ contextTagsText: event.target.value })}
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="agent-description-input">描述</label>
              <textarea
                id="agent-description-input"
                className="settings-textarea"
                rows={2}
                value={form.description}
                onChange={(event) => updateForm({ description: event.target.value })}
              />
            </div>

            <fieldset className="agent-config-box">
              <legend>能力</legend>
              <div className="agent-form-grid">
                <div className="field-group">
                  <label htmlFor="agent-tools-input">Tools</label>
                  <textarea
                    id="agent-tools-input"
                    className="settings-textarea agent-mono-textarea"
                    rows={4}
                    placeholder="bash&#10;datetime"
                    value={form.toolsText}
                    onChange={(event) => updateForm({ toolsText: event.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-skills-input">Skills</label>
                  <textarea
                    id="agent-skills-input"
                    className="settings-textarea agent-mono-textarea"
                    rows={4}
                    placeholder="skill-key"
                    value={form.skillsText}
                    onChange={(event) => updateForm({ skillsText: event.target.value })}
                  />
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="agent-wonders-input">Wonders</label>
                <textarea
                  id="agent-wonders-input"
                  className="settings-textarea"
                  rows={3}
                  value={form.wondersText}
                  onChange={(event) => updateForm({ wondersText: event.target.value })}
                />
              </div>
            </fieldset>

            <fieldset className="agent-config-box">
              <legend>高级配置</legend>
              <div className="agent-form-grid">
                <div className="field-group">
                  <label htmlFor="agent-controls-input">Controls</label>
                  <textarea
                    id="agent-controls-input"
                    className="settings-textarea agent-mono-textarea"
                    rows={5}
                    value={form.controlsText}
                    onChange={(event) => updateForm({ controlsText: event.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-runtime-input">Runtime Config</label>
                  <textarea
                    id="agent-runtime-input"
                    className="settings-textarea agent-mono-textarea"
                    rows={5}
                    placeholder='{"environmentId":"shell","level":"RUN"}'
                    value={form.runtimeConfigText}
                    onChange={(event) => updateForm({ runtimeConfigText: event.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-memory-input">Memory Config</label>
                  <textarea
                    id="agent-memory-input"
                    className="settings-textarea agent-mono-textarea"
                    rows={5}
                    value={form.memoryConfigText}
                    onChange={(event) => updateForm({ memoryConfigText: event.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="agent-proxy-input">Proxy Config</label>
                  <textarea
                    id="agent-proxy-input"
                    className="settings-textarea agent-mono-textarea"
                    rows={5}
                    value={form.proxyConfigText}
                    onChange={(event) => updateForm({ proxyConfigText: event.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="agent-config-box">
              <legend>Prompt</legend>
              <div className="field-group">
                <label htmlFor="agent-soul-input">SOUL.md</label>
                <textarea
                  id="agent-soul-input"
                  className="settings-textarea agent-prompt-textarea"
                  rows={5}
                  value={form.soulPrompt}
                  onChange={(event) => updateForm({ soulPrompt: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="agent-agents-input">AGENTS.md</label>
                <textarea
                  id="agent-agents-input"
                  className="settings-textarea agent-prompt-textarea"
                  rows={5}
                  value={form.agentsPrompt}
                  onChange={(event) => updateForm({ agentsPrompt: event.target.value })}
                />
              </div>
            </fieldset>

            {formError && <div className="settings-error">{formError}</div>}

            <div className="agent-save-actions">
              <UiButton
                size="sm"
                variant="primary"
                onClick={saveForm}
                disabled={saving}
              >
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

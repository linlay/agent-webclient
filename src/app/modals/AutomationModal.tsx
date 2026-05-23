import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, Input, Select, Spin, Tooltip } from "antd";
import type { Agent, Team } from "@/app/state/types";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  getAutomationExecutions,
  getAutomations,
  toggleAutomation,
  updateAutomation,
} from "@/features/transport/lib/apiClientProxy";
import type {
  CreateAutomationRequest,
  AutomationDetailResponse,
  AutomationExecutionResponse,
  AutomationQueryRequest,
  AutomationSummaryResponse,
  UpdateAutomationRequest,
} from "@/shared/api/apiClient";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";

type AutomationStatusFilter = "all" | "enabled" | "disabled";
type AutomationFormMode = "create" | "edit";

interface AutomationFormState {
  id: string;
  name: string;
  description: string;
  cron: string;
  agentKey: string;
  teamId: string;
  zoneId: string;
  remainingRuns: string;
  enabled: boolean;
  message: string;
  chatId: string;
  role: string;
  hidden: "" | "true" | "false";
  paramsText: string;
}

const EMPTY_FORM: AutomationFormState = {
  id: "",
  name: "",
  description: "",
  cron: "0 9 * * *",
  agentKey: "",
  teamId: "",
  zoneId: "",
  remainingRuns: "",
  enabled: true,
  message: "",
  chatId: "",
  role: "user",
  hidden: "",
  paramsText: "",
};

const CRON_PRESETS = [
  { label: "每天 09:00", value: "0 9 * * *" },
  { label: "工作日 18:00", value: "0 18 * * 1-5" },
  { label: "每 5 分钟", value: "*/5 * * * *" },
  { label: "每小时", value: "0 * * * *" },
];

const COMMON_ZONE_OPTIONS = [
  "Asia/Shanghai",
  "UTC",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Bangkok",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
];

function compactPayload<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (next[key] === "" || next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    const record = asRecord(value);
    const nested = record ? firstString([record.key, record.agentKey]) : "";
    if (nested) return nested;
  }
  return "";
}

function resolveDefaultAgentKey(
  currentWorker: CurrentWorkerSummary | null,
): string {
  if (!currentWorker) return "";
  if (currentWorker.type === "agent") return currentWorker.sourceId;
  const raw = currentWorker.raw || {};
  const agentKeys = Array.isArray(raw.agentKeys) ? raw.agentKeys : [];
  const agents = Array.isArray(raw.agents) ? raw.agents : [];
  const members = Array.isArray(raw.members) ? raw.members : [];
  return firstString([raw.agentKey, ...agentKeys, ...agents, ...members]);
}

function createInitialForm(
  currentWorker: CurrentWorkerSummary | null,
): AutomationFormState {
  return {
    ...EMPTY_FORM,
    agentKey: resolveDefaultAgentKey(currentWorker),
    teamId: currentWorker?.type === "team" ? currentWorker.sourceId : "",
  };
}

function formFromAutomation(automation: AutomationDetailResponse): AutomationFormState {
  const params = automation.query?.params;
  return {
    id: automation.id,
    name: automation.name || "",
    description: automation.description || "",
    cron: automation.cron || "",
    agentKey: automation.agentKey || "",
    teamId: automation.teamId || "",
    zoneId: automation.zoneId || "",
    remainingRuns:
      automation.remainingRuns === undefined || automation.remainingRuns === null
        ? ""
        : String(automation.remainingRuns),
    enabled: Boolean(automation.enabled),
    message: automation.query?.message || "",
    chatId: automation.query?.chatId || "",
    role: automation.query?.role || "user",
    hidden:
      automation.query?.hidden === true
        ? "true"
        : automation.query?.hidden === false
          ? "false"
          : "",
    paramsText:
      params && Object.keys(params).length > 0
        ? JSON.stringify(params, null, 2)
        : "",
  };
}

function isFiveFieldCron(value: string): boolean {
  return value.trim().split(/\s+/).length === 5;
}

function toTimeLabel(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "--";
  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function toDurationLabel(value?: number | null): string {
  if (value === undefined || value === null) return "--";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function automationSourcePath(automation: AutomationSummaryResponse): string {
  const source = String(automation.sourceFile || "").trim();
  if (!source) return automation.id;
  const normalized = source.replace(/\\/g, "/");
  const filename = normalized.split("/").filter(Boolean).pop();
  return filename || automation.id;
}

function automationListMeta(automation: AutomationSummaryResponse): string {
  const lastStatus = automation.lastExecution?.status || "--";
  return [
    automation.cron || "--",
    `下次 ${toTimeLabel(automation.nextFireTime)}`,
    `最近 ${lastStatus}`,
  ].join(" · ");
}

function buildQuery(form: AutomationFormState): AutomationQueryRequest {
  const query: AutomationQueryRequest = {
    message: form.message.trim(),
    role: form.role.trim() || "user",
  };
  const chatId = form.chatId.trim();
  if (chatId) query.chatId = chatId;
  if (form.hidden === "true") query.hidden = true;
  if (form.hidden === "false") query.hidden = false;
  const paramsText = form.paramsText.trim();
  if (paramsText) {
    query.params = JSON.parse(paramsText) as Record<string, unknown>;
  }
  return query;
}

function buildCreatePayload(form: AutomationFormState): CreateAutomationRequest {
  return compactPayload({
    name: form.name.trim(),
    description: form.description.trim(),
    cron: form.cron.trim(),
    agentKey: form.agentKey.trim(),
    teamId: form.teamId.trim(),
    zoneId: form.zoneId.trim(),
    enabled: form.enabled,
    remainingRuns: form.remainingRuns.trim()
      ? Number(form.remainingRuns.trim())
      : undefined,
    query: buildQuery(form),
  }) as CreateAutomationRequest;
}

function buildUpdatePayload(form: AutomationFormState): UpdateAutomationRequest {
  return compactPayload({
    id: form.id,
    name: form.name.trim(),
    description: form.description.trim(),
    cron: form.cron.trim(),
    agentKey: form.agentKey.trim(),
    teamId: form.teamId.trim(),
    zoneId: form.zoneId.trim(),
    enabled: form.enabled,
    remainingRuns: form.remainingRuns.trim()
      ? Number(form.remainingRuns.trim())
      : undefined,
    query: buildQuery(form),
  }) as UpdateAutomationRequest;
}

function validateForm(form: AutomationFormState): string {
  if (!form.name.trim()) return "请填写自动化名称。";
  if (!form.description.trim()) return "请填写自动化描述。";
  if (!form.cron.trim()) return "请填写 cron。";
  if (!isFiveFieldCron(form.cron)) return "cron 必须是传统 5 段格式。";
  if (!form.agentKey.trim()) return "请填写 AgentKey。";
  if (!form.message.trim()) return "请填写自动化消息。";
  if (form.remainingRuns.trim()) {
    const runs = Number(form.remainingRuns.trim());
    if (!Number.isInteger(runs) || runs <= 0) {
      return "剩余次数必须是正整数。";
    }
  }
  if (form.paramsText.trim()) {
    try {
      const parsed = JSON.parse(form.paramsText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "Params 必须是 JSON 对象。";
      }
    } catch (error) {
      return `Params JSON 无效：${(error as Error).message}`;
    }
  }
  return "";
}

export const AutomationModal: React.FC<{
  currentWorker: CurrentWorkerSummary | null;
  agents: Agent[];
  teams: Team[];
}> = ({ currentWorker, agents, teams }) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const automations = state.automations;
  const [selectedId, setSelectedId] = useState("");
  const [executions, setExecutions] = useState<AutomationExecutionResponse[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<AutomationStatusFilter>("all");
  const [workerFilter, setWorkerFilter] = useState("");
  const [formMode, setFormMode] = useState<AutomationFormMode>("create");
  const [form, setForm] = useState<AutomationFormState>(() =>
    createInitialForm(currentWorker),
  );
  const [loading, setLoading] = useState(false);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const didAutoSelectInitialAutomationRef = useRef(false);

  const workerOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const item of automations) {
      if (item.agentKey)
        values.set(`agent:${item.agentKey}`, `Agent · ${item.agentKey}`);
      if (item.teamId)
        values.set(`team:${item.teamId}`, `Team · ${item.teamId}`);
    }
    return Array.from(values.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [automations]);

  const agentOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const agent of Array.isArray(agents) ? agents : []) {
      const key = String(agent?.key || "").trim();
      if (!key) continue;
      const name = String(agent?.name || key).trim() || key;
      const role = String(agent?.role || "").trim();
      options.set(key, role ? `${name} · ${role}` : name);
    }
    const currentAgentKey = form.agentKey.trim();
    if (currentAgentKey && !options.has(currentAgentKey)) {
      options.set(currentAgentKey, currentAgentKey);
    }
    return Array.from(options.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [agents, form.agentKey]);

  const zoneOptions = useMemo(() => {
    const values = new Set(COMMON_ZONE_OPTIONS);
    const currentZone = form.zoneId.trim();
    if (currentZone) values.add(currentZone);
    return Array.from(values).sort((left, right) => {
      if (left === "Asia/Shanghai") return -1;
      if (right === "Asia/Shanghai") return 1;
      if (left === "UTC") return -1;
      if (right === "UTC") return 1;
      return left.localeCompare(right);
    });
  }, [form.zoneId]);

  const workerNameByKey = useMemo(() => {
    const values = new Map<string, string>();
    for (const agent of Array.isArray(agents) ? agents : []) {
      const key = String(agent?.key || "").trim();
      if (!key) continue;
      values.set(`agent:${key}`, String(agent?.name || key).trim() || key);
    }
    for (const team of Array.isArray(teams) ? teams : []) {
      const teamId = String(team?.teamId || "").trim();
      if (!teamId) continue;
      values.set(
        `team:${teamId}`,
        String(team?.name || teamId).trim() || teamId,
      );
    }
    return values;
  }, [agents, teams]);

  const getAutomationWorkerName = useCallback(
    (automation: AutomationSummaryResponse): string => {
      const teamId = String(automation.teamId || "").trim();
      if (teamId) return workerNameByKey.get(`team:${teamId}`) || teamId;
      const agentKey = String(automation.agentKey || "").trim();
      if (agentKey) return workerNameByKey.get(`agent:${agentKey}`) || agentKey;
      return "--";
    },
    [workerNameByKey],
  );

  const filteredAutomations = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return automations.filter((item) => {
      if (statusFilter === "enabled" && !item.enabled) return false;
      if (statusFilter === "disabled" && item.enabled) return false;
      if (
        workerFilter.startsWith("agent:") &&
        item.agentKey !== workerFilter.slice(6)
      )
        return false;
      if (
        workerFilter.startsWith("team:") &&
        item.teamId !== workerFilter.slice(5)
      )
        return false;
      if (!query) return true;
      return [
        item.name,
        item.description,
        item.cron,
        item.agentKey,
        item.teamId,
        item.lastExecution?.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [automations, searchText, statusFilter, workerFilter]);

  const selectedSummary = useMemo(
    () => automations.find((item) => item.id === selectedId) || null,
    [automations, selectedId],
  );

  const loadExecutions = useCallback(async (id: string) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      setExecutions([]);
      return;
    }
    setExecutionsLoading(true);
    try {
      const response = await getAutomationExecutions({
        id: normalizedId,
        limit: 20,
      });
      setExecutions(response.data.items || []);
    } catch (error) {
      setError((error as Error).message);
      setExecutions([]);
    } finally {
      setExecutionsLoading(false);
    }
  }, []);

  const startCreate = useCallback(() => {
    setSelectedId("");
    setFormMode("create");
    setForm(createInitialForm(currentWorker));
    setExecutions([]);
    setFormError("");
    setPendingDeleteId("");
  }, [currentWorker]);

  const selectAutomation = useCallback(
    async (id: string) => {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) {
        startCreate();
        return;
      }
      setSelectedId(normalizedId);
      setFormMode("edit");
      setFormError("");
      setPendingDeleteId("");
      try {
        const response = await getAutomation(normalizedId);
        setForm(formFromAutomation(response.data));
        await loadExecutions(normalizedId);
      } catch (error) {
        setError((error as Error).message);
      }
    },
    [loadExecutions, startCreate],
  );

  const loadAutomations = useCallback(
    async (preferredId = "") => {
      setLoading(true);
      setError("");
      try {
        const response = await getAutomations();
        const items = response.data.items || [];
        dispatch({ type: "SET_AUTOMATIONS", automations: items });
        const nextId =
          preferredId && items.some((item) => item.id === preferredId)
            ? preferredId
            : items[0]?.id || "";
        if (nextId) {
          await selectAutomation(nextId);
        } else {
          startCreate();
        }
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [dispatch, selectAutomation, startCreate],
  );

  useEffect(() => {
    if (
      didAutoSelectInitialAutomationRef.current ||
      selectedId ||
      formMode !== "create" ||
      automations.length === 0
    ) {
      return;
    }
    didAutoSelectInitialAutomationRef.current = true;
    void selectAutomation(automations[0].id);
  }, [formMode, automations, selectAutomation, selectedId]);

  const updateForm = (patch: Partial<AutomationFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setFormError("");
  };

  const saveForm = async () => {
    const validation = validateForm(form);
    if (validation) {
      setFormError(validation);
      return;
    }
    setSaving(true);
    setError("");
    setFormError("");
    try {
      const response =
        formMode === "create"
          ? await createAutomation(buildCreatePayload(form))
          : await updateAutomation(buildUpdatePayload(form));
      await loadAutomations(response.data.id);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelected = async (item: AutomationSummaryResponse) => {
    setSaving(true);
    setError("");
    try {
      const response = await toggleAutomation({
        id: item.id,
        enabled: !item.enabled,
      });
      const detail = response.data;
      dispatch({
        type: "SET_AUTOMATIONS",
        automations: automations.map((row) =>
          row.id === detail.id
            ? {
                ...row,
                ...detail,
              }
            : row,
        ),
      });
      if (selectedId === detail.id) {
        setForm(formFromAutomation(detail));
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (item: AutomationSummaryResponse) => {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await deleteAutomation({ id: item.id });
      const remaining = automations.filter((row) => row.id !== item.id);
      dispatch({ type: "SET_AUTOMATIONS", automations: remaining });
      setPendingDeleteId("");
      if (selectedId === item.id) {
        const nextId = remaining[0]?.id || "";
        if (nextId) {
          await selectAutomation(nextId);
        } else {
          startCreate();
        }
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="command-modal-section automation-console">
      <div className="automation-console-toolbar">
        <Input
          prefix={
            <MaterialIcon
              name="search"
              style={{ color: "var(--text-muted)" }}
            />
          }
          variant="filled"
          placeholder="搜索自动化..."
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          options={[
            { value: "all", label: "全部状态" },
            { value: "enabled", label: "已启用" },
            { value: "disabled", label: "已停用" },
          ]}
        />
        <Select
          value={workerFilter}
          onChange={(value) => setWorkerFilter(value)}
          options={[{ value: "", label: "全部对象" }, ...workerOptions]}
        />
        <UiButton
          size="sm"
          variant="ghost"
          iconOnly
          onClick={() => loadAutomations(selectedId)}
          disabled={loading || saving}
        >
          <MaterialIcon name="refresh" />
        </UiButton>
        <UiButton size="sm" variant="primary" onClick={startCreate}>
          <MaterialIcon name="add" />
          <span>新建</span>
        </UiButton>
      </div>

      {error && (
        <div className="automation-console-error">
          <span>{error}</span>
          <UiButton
            size="sm"
            variant="ghost"
            onClick={() => loadAutomations(selectedId)}
          >
            重试
          </UiButton>
        </div>
      )}

      <div className="automation-console-body">
        <div className="automation-console-list">
          <div className="automation-console-count">
            自动化 {automations.length} 个
          </div>
          <Spin spinning={loading}>
            {filteredAutomations.length === 0 ? (
              <div className="command-empty-state">
                暂无匹配自动化。
                <UiButton size="sm" variant="primary" onClick={startCreate}>
                  新建自动化
                </UiButton>
              </div>
            ) : (
              <div className="automation-list-items">
                {filteredAutomations.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`automation-list-item ${item.id === selectedId ? "is-active" : ""}`}
                    onClick={() => selectAutomation(item.id)}
                  >
                    <span className="automation-list-item-head">
                      <span
                        className="automation-list-item-title"
                        title={`${getAutomationWorkerName(item)} ${item.name || item.id}`}
                      >
                        <span className="automation-list-item-owner">
                          [{getAutomationWorkerName(item)}]
                        </span>
                        <strong>{item.name || item.id}</strong>
                      </span>
                      <UiTag tone={item.enabled ? "accent" : "muted"}>
                        {item.enabled ? "启用" : "停用"}
                      </UiTag>
                    </span>
                    <span
                      className="automation-list-item-meta"
                      title={automationListMeta(item)}
                    >
                      {automationListMeta(item)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Spin>
        </div>

        <div className="automation-console-detail">
          <div className="automation-detail-head">
            <div>
              <strong>
                {formMode === "create"
                  ? "新建自动化"
                  : selectedSummary?.name || "编辑自动化"}
              </strong>
              <span>
                {formMode === "create"
                  ? "保存后立即写入后端 automation 配置"
                  : selectedSummary
                    ? automationSourcePath(selectedSummary)
                    : selectedId}
              </span>
            </div>
            {selectedSummary && (
              <div className="automation-detail-actions">
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleSelected(selectedSummary)}
                  disabled={saving}
                >
                  <MaterialIcon
                    name={
                      selectedSummary.enabled ? "pause_circle" : "play_circle"
                    }
                  />
                  <span>{selectedSummary.enabled ? "停用" : "启用"}</span>
                </UiButton>
                <UiButton
                  size="sm"
                  variant="danger"
                  onClick={() => confirmDelete(selectedSummary)}
                  disabled={saving}
                >
                  <MaterialIcon name="delete" />
                  <span>
                    {pendingDeleteId === selectedSummary.id
                      ? "确认删除"
                      : "删除"}
                  </span>
                </UiButton>
              </div>
            )}
          </div>

          <div className="automation-form-grid">
            <div className="field-group">
              <label htmlFor="automation-name-input">名称</label>
              <Input
                id="automation-name-input"
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
              />
            </div>
            <div className="field-group">
              <label htmlFor="automation-cron-input">Cron</label>
              <div className="automation-cron-control">
                <Input
                  id="automation-cron-input"
                  value={form.cron}
                  onChange={(event) => updateForm({ cron: event.target.value })}
                />
                <Select
                  aria-label="Cron 快捷选择"
                  value={
                    CRON_PRESETS.some((preset) => preset.value === form.cron)
                      ? form.cron
                      : ""
                  }
                  onChange={(value) => {
                    if (value) updateForm({ cron: value });
                  }}
                  options={[{ value: "", label: "快捷选择" }, ...CRON_PRESETS]}
                />
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="automation-agent-input">智能体</label>
              <Select
                id="automation-agent-input"
                value={form.agentKey}
                onChange={(value) => updateForm({ agentKey: value })}
                options={[{ value: "", label: "请选择智能体" }, ...agentOptions]}
              />
            </div>
            <div className="field-group">
              <label htmlFor="automation-team-input">TeamID</label>
              <Input
                id="automation-team-input"
                value={form.teamId}
                onChange={(event) => updateForm({ teamId: event.target.value })}
              />
            </div>
            <div className="field-group">
              <label htmlFor="automation-zone-input">时区</label>
              <Select
                id="automation-zone-input"
                value={form.zoneId}
                onChange={(value) => updateForm({ zoneId: value })}
                options={[
                  { value: "", label: "默认时区" },
                  ...zoneOptions.map((zoneId) => ({
                    value: zoneId,
                    label: zoneId,
                  })),
                ]}
              />
            </div>
            <div className="field-group">
              <label htmlFor="automation-runs-input">剩余次数</label>
              <Input
                id="automation-runs-input"
                type="number"
                min="1"
                placeholder="留空表示无限次"
                value={form.remainingRuns}
                onChange={(event) =>
                  updateForm({ remainingRuns: event.target.value })
                }
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="automation-description-input">描述</label>
            <Input.TextArea
              id="automation-description-input"
              className="settings-textarea"
              rows={2}
              value={form.description}
              onChange={(event) =>
                updateForm({ description: event.target.value })
              }
            />
          </div>

          <fieldset className="automation-request-box">
            <legend>请求</legend>
            <div className="field-group">
              <label htmlFor="automation-message-input">自动化消息</label>
              <Input.TextArea
                id="automation-message-input"
                className="settings-textarea"
                rows={4}
                value={form.message}
                onChange={(event) =>
                  updateForm({ message: event.target.value })
                }
              />
            </div>

            <div className="automation-form-grid">
              <div className="field-group">
                <label htmlFor="automation-chat-input">会话ID</label>
                <Input
                  id="automation-chat-input"
                  value={form.chatId}
                  onChange={(event) =>
                    updateForm({ chatId: event.target.value })
                  }
                />
              </div>
              <div className="field-group">
                <label htmlFor="automation-role-input">角色</label>
                <Input
                  id="automation-role-input"
                  value={form.role}
                  onChange={(event) => updateForm({ role: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="automation-hidden-select">是否隐藏</label>
                <Select
                  id="automation-hidden-select"
                  value={form.hidden}
                  onChange={(value) =>
                    updateForm({
                      hidden: value,
                    })
                  }
                  options={[
                    { value: "", label: "不传" },
                    { value: "true", label: "是" },
                    { value: "false", label: "否" },
                  ]}
                />
              </div>
              <div className="field-group automation-enabled-field">
                <Checkbox
                  checked={form.enabled}
                  onChange={(event) =>
                    updateForm({ enabled: event.target.checked })
                  }
                >
                  启用自动化
                </Checkbox>
              </div>
            </div>

            <div className="field-group" style={{ marginTop: 10 }}>
              <label htmlFor="automation-params-input">
                <span>参数</span>
                <Tooltip title="JSON格式" arrow={false}>
                  <MaterialIcon name="help" />
                </Tooltip>
              </label>
              <Input.TextArea
                id="automation-params-input"
                className="settings-textarea automation-mono-textarea"
                rows={3}
                placeholder='{"kind":"daily"}'
                value={form.paramsText}
                onChange={(event) =>
                  updateForm({ paramsText: event.target.value })
                }
              />
            </div>
          </fieldset>

          {formError && <div className="settings-error">{formError}</div>}

          <div className="automation-save-actions">
            <UiButton
              size="sm"
              variant="primary"
              onClick={saveForm}
              disabled={saving}
            >
              <MaterialIcon name="save" />
              <span>{formMode === "create" ? "创建自动化" : "保存修改"}</span>
            </UiButton>
            {formMode === "edit" && (
              <UiButton
                size="sm"
                variant="ghost"
                onClick={startCreate}
                disabled={saving}
              >
                取消编辑
              </UiButton>
            )}
          </div>

          <div className="automation-executions">
            <div className="automation-executions-head">
              <strong>执行记录</strong>
              <UiButton
                size="sm"
                variant="ghost"
                onClick={() => loadExecutions(selectedId)}
                disabled={!selectedId || executionsLoading}
              >
                <MaterialIcon name="refresh" />
                <span>刷新</span>
              </UiButton>
            </div>
            <Spin spinning={executionsLoading}>
              {!selectedId ? (
                <div className="command-empty-state">
                  保存或选择自动化后查看执行记录。
                </div>
              ) : executions.length === 0 ? (
                <div className="command-empty-state">暂无执行记录。</div>
              ) : (
                <div className="automation-execution-list">
                  {executions.map((item) => (
                    <div className="automation-execution-row" key={item.id}>
                      <span>{item.status}</span>
                      <span>{toTimeLabel(item.startedAt)}</span>
                      <span>{toDurationLabel(item.durationMs)}</span>
                      <span>{item.error || "--"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Spin>
          </div>
        </div>
      </div>
    </div>
  );
};

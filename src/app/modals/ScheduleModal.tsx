import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Spin } from "antd";
import type { Agent, Team } from "@/app/state/types";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  getScheduleExecutions,
  getSchedules,
  toggleSchedule,
  updateSchedule,
} from "@/features/transport/lib/apiClientProxy";
import type {
  CreateScheduleRequest,
  ScheduleDetailResponse,
  ScheduleExecutionResponse,
  ScheduleQueryRequest,
  ScheduleSummaryResponse,
  UpdateScheduleRequest,
} from "@/shared/api/apiClient";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiInput } from "@/shared/ui/UiInput";
import { UiTag } from "@/shared/ui/UiTag";

type ScheduleStatusFilter = "all" | "enabled" | "disabled";
type ScheduleFormMode = "create" | "edit";

interface ScheduleFormState {
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

const EMPTY_FORM: ScheduleFormState = {
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
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
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

function resolveDefaultAgentKey(currentWorker: CurrentWorkerSummary | null): string {
  if (!currentWorker) return "";
  if (currentWorker.type === "agent") return currentWorker.sourceId;
  const raw = currentWorker.raw || {};
  const agentKeys = Array.isArray(raw.agentKeys) ? raw.agentKeys : [];
  const agents = Array.isArray(raw.agents) ? raw.agents : [];
  const members = Array.isArray(raw.members) ? raw.members : [];
  return firstString([raw.agentKey, ...agentKeys, ...agents, ...members]);
}

function createInitialForm(currentWorker: CurrentWorkerSummary | null): ScheduleFormState {
  return {
    ...EMPTY_FORM,
    agentKey: resolveDefaultAgentKey(currentWorker),
    teamId: currentWorker?.type === "team" ? currentWorker.sourceId : "",
  };
}

function formFromSchedule(schedule: ScheduleDetailResponse): ScheduleFormState {
  const params = schedule.query?.params;
  return {
    id: schedule.id,
    name: schedule.name || "",
    description: schedule.description || "",
    cron: schedule.cron || "",
    agentKey: schedule.agentKey || "",
    teamId: schedule.teamId || "",
    zoneId: schedule.zoneId || "",
    remainingRuns:
      schedule.remainingRuns === undefined || schedule.remainingRuns === null
        ? ""
        : String(schedule.remainingRuns),
    enabled: Boolean(schedule.enabled),
    message: schedule.query?.message || "",
    chatId: schedule.query?.chatId || "",
    role: schedule.query?.role || "user",
    hidden:
      schedule.query?.hidden === true
        ? "true"
        : schedule.query?.hidden === false
          ? "false"
          : "",
    paramsText: params && Object.keys(params).length > 0
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
    typeof value === "number"
      ? new Date(value)
      : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function toDurationLabel(value?: number | null): string {
  if (value === undefined || value === null) return "--";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function scheduleSourcePath(schedule: ScheduleSummaryResponse): string {
  const source = String(schedule.sourceFile || "").trim();
  if (!source) return schedule.id;
  const normalized = source.replace(/\\/g, "/");
  const filename = normalized.split("/").filter(Boolean).pop();
  return filename || schedule.id;
}

function scheduleListMeta(schedule: ScheduleSummaryResponse): string {
  const lastStatus = schedule.lastExecution?.status || "--";
  return [
    schedule.cron || "--",
    `下次 ${toTimeLabel(schedule.nextFireTime)}`,
    `最近 ${lastStatus}`,
  ].join(" · ");
}

function buildQuery(form: ScheduleFormState): ScheduleQueryRequest {
  const query: ScheduleQueryRequest = {
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

function buildCreatePayload(form: ScheduleFormState): CreateScheduleRequest {
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
  }) as CreateScheduleRequest;
}

function buildUpdatePayload(form: ScheduleFormState): UpdateScheduleRequest {
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
  }) as UpdateScheduleRequest;
}

function validateForm(form: ScheduleFormState): string {
  if (!form.name.trim()) return "请填写任务名称。";
  if (!form.description.trim()) return "请填写任务描述。";
  if (!form.cron.trim()) return "请填写 cron。";
  if (!isFiveFieldCron(form.cron)) return "cron 必须是传统 5 段格式。";
  if (!form.agentKey.trim()) return "请填写 AgentKey。";
  if (!form.message.trim()) return "请填写任务消息。";
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

export const ScheduleModal: React.FC<{
  currentWorker: CurrentWorkerSummary | null;
  agents: Agent[];
  teams: Team[];
}> = ({ currentWorker, agents, teams }) => {
  const [schedules, setSchedules] = useState<ScheduleSummaryResponse[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [executions, setExecutions] = useState<ScheduleExecutionResponse[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>("all");
  const [workerFilter, setWorkerFilter] = useState("");
  const [formMode, setFormMode] = useState<ScheduleFormMode>("create");
  const [form, setForm] = useState<ScheduleFormState>(() => createInitialForm(currentWorker));
  const [loading, setLoading] = useState(false);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");

  const workerOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const item of schedules) {
      if (item.agentKey) values.set(`agent:${item.agentKey}`, `Agent · ${item.agentKey}`);
      if (item.teamId) values.set(`team:${item.teamId}`, `Team · ${item.teamId}`);
    }
    return Array.from(values.entries()).map(([value, label]) => ({ value, label }));
  }, [schedules]);

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
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
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
      values.set(`team:${teamId}`, String(team?.name || teamId).trim() || teamId);
    }
    return values;
  }, [agents, teams]);

  const getScheduleWorkerName = useCallback((schedule: ScheduleSummaryResponse): string => {
    const teamId = String(schedule.teamId || "").trim();
    if (teamId) return workerNameByKey.get(`team:${teamId}`) || teamId;
    const agentKey = String(schedule.agentKey || "").trim();
    if (agentKey) return workerNameByKey.get(`agent:${agentKey}`) || agentKey;
    return "--";
  }, [workerNameByKey]);

  const filteredSchedules = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return schedules.filter((item) => {
      if (statusFilter === "enabled" && !item.enabled) return false;
      if (statusFilter === "disabled" && item.enabled) return false;
      if (workerFilter.startsWith("agent:") && item.agentKey !== workerFilter.slice(6)) return false;
      if (workerFilter.startsWith("team:") && item.teamId !== workerFilter.slice(5)) return false;
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
  }, [schedules, searchText, statusFilter, workerFilter]);

  const selectedSummary = useMemo(
    () => schedules.find((item) => item.id === selectedId) || null,
    [schedules, selectedId],
  );

  const loadExecutions = useCallback(async (id: string) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      setExecutions([]);
      return;
    }
    setExecutionsLoading(true);
    try {
      const response = await getScheduleExecutions({ id: normalizedId, limit: 20 });
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

  const selectSchedule = useCallback(async (id: string) => {
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
      const response = await getSchedule(normalizedId);
      setForm(formFromSchedule(response.data));
      await loadExecutions(normalizedId);
    } catch (error) {
      setError((error as Error).message);
    }
  }, [loadExecutions, startCreate]);

  const loadSchedules = useCallback(async (preferredId = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await getSchedules();
      const items = response.data.items || [];
      setSchedules(items);
      const nextId =
        preferredId && items.some((item) => item.id === preferredId)
          ? preferredId
          : items[0]?.id || "";
      if (nextId) {
        await selectSchedule(nextId);
      } else {
        startCreate();
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectSchedule, startCreate]);

  useEffect(() => {
    void loadSchedules("");
  }, [loadSchedules]);

  const updateForm = (patch: Partial<ScheduleFormState>) => {
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
          ? await createSchedule(buildCreatePayload(form))
          : await updateSchedule(buildUpdatePayload(form));
      await loadSchedules(response.data.id);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelected = async (item: ScheduleSummaryResponse) => {
    setSaving(true);
    setError("");
    try {
      const response = await toggleSchedule({ id: item.id, enabled: !item.enabled });
      const detail = response.data;
      setSchedules((rows) =>
        rows.map((row) =>
          row.id === detail.id
            ? {
                ...row,
                ...detail,
              }
            : row,
        ),
      );
      if (selectedId === detail.id) {
        setForm(formFromSchedule(detail));
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (item: ScheduleSummaryResponse) => {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await deleteSchedule({ id: item.id });
      const remaining = schedules.filter((row) => row.id !== item.id);
      setSchedules(remaining);
      setPendingDeleteId("");
      if (selectedId === item.id) {
        const nextId = remaining[0]?.id || "";
        if (nextId) {
          await selectSchedule(nextId);
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
    <div className="command-modal-section schedule-console">
      <div className="schedule-console-toolbar">
        <Input
          prefix={<MaterialIcon name="search" style={{ color: "var(--text-muted)" }} />}
          variant="filled"
          placeholder="搜索计划任务..."
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ScheduleStatusFilter)}>
          <option value="all">全部状态</option>
          <option value="enabled">已启用</option>
          <option value="disabled">已停用</option>
        </select>
        <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)}>
          <option value="">全部对象</option>
          {workerOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <UiButton size="sm" variant="ghost" iconOnly onClick={() => loadSchedules(selectedId)} disabled={loading || saving}>
          <MaterialIcon name="refresh" />
        </UiButton>
        <UiButton size="sm" variant="primary" onClick={startCreate}>
          <MaterialIcon name="add" />
          <span>新建</span>
        </UiButton>
      </div>

      {error && (
        <div className="schedule-console-error">
          <span>{error}</span>
          <UiButton size="sm" variant="ghost" onClick={() => loadSchedules(selectedId)}>重试</UiButton>
        </div>
      )}

      <div className="schedule-console-body">
        <div className="schedule-console-list">
          <div className="schedule-console-count">计划任务 {schedules.length} 个</div>
          <Spin spinning={loading}>
            {filteredSchedules.length === 0 ? (
              <div className="command-empty-state">
                暂无匹配计划任务。
                <UiButton size="sm" variant="primary" onClick={startCreate}>新建任务</UiButton>
              </div>
            ) : (
              <div className="schedule-list-items">
                {filteredSchedules.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`schedule-list-item ${item.id === selectedId ? "is-active" : ""}`}
                    onClick={() => selectSchedule(item.id)}
	                  >
                    <span className="schedule-list-item-head">
                      <span className="schedule-list-item-title" title={`${getScheduleWorkerName(item)} ${item.name || item.id}`}>
                        <span className="schedule-list-item-owner">[{getScheduleWorkerName(item)}]</span>
                        <strong>{item.name || item.id}</strong>
                      </span>
                      <UiTag tone={item.enabled ? "accent" : "muted"}>
                        {item.enabled ? "启用" : "停用"}
                      </UiTag>
                    </span>
                    <span className="schedule-list-item-meta" title={scheduleListMeta(item)}>
                      {scheduleListMeta(item)}
                    </span>
	                  </button>
                ))}
              </div>
            )}
          </Spin>
        </div>

        <div className="schedule-console-detail">
          <div className="schedule-detail-head">
            <div>
              <strong>{formMode === "create" ? "新建计划任务" : selectedSummary?.name || "编辑计划任务"}</strong>
              <span>{formMode === "create" ? "保存后立即写入后端 schedule 配置" : selectedSummary ? scheduleSourcePath(selectedSummary) : selectedId}</span>
            </div>
            {selectedSummary && (
              <div className="schedule-detail-actions">
                <UiButton size="sm" variant="ghost" onClick={() => toggleSelected(selectedSummary)} disabled={saving}>
                  <MaterialIcon name={selectedSummary.enabled ? "pause_circle" : "play_circle"} />
                  <span>{selectedSummary.enabled ? "停用" : "启用"}</span>
                </UiButton>
                <UiButton size="sm" variant="danger" onClick={() => confirmDelete(selectedSummary)} disabled={saving}>
                  <MaterialIcon name="delete" />
                  <span>{pendingDeleteId === selectedSummary.id ? "确认删除" : "删除"}</span>
                </UiButton>
              </div>
            )}
          </div>

          <div className="schedule-form-grid">
            <div className="field-group">
              <label htmlFor="schedule-name-input">名称</label>
              <UiInput id="schedule-name-input" inputSize="md" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />
            </div>
	            <div className="field-group">
	              <label htmlFor="schedule-cron-input">Cron</label>
	              <div className="schedule-cron-control">
	                <UiInput id="schedule-cron-input" inputSize="md" value={form.cron} onChange={(event) => updateForm({ cron: event.target.value })} />
	                <select
	                  aria-label="Cron 快捷选择"
	                  value={CRON_PRESETS.some((preset) => preset.value === form.cron) ? form.cron : ""}
	                  onChange={(event) => {
	                    if (event.target.value) updateForm({ cron: event.target.value });
	                  }}
	                >
	                  <option value="">快捷选择</option>
	                  {CRON_PRESETS.map((preset) => (
	                    <option key={preset.value} value={preset.value}>{preset.label}</option>
	                  ))}
	                </select>
	              </div>
	            </div>
	            <div className="field-group">
	              <label htmlFor="schedule-agent-input">智能体</label>
	              <select id="schedule-agent-input" value={form.agentKey} onChange={(event) => updateForm({ agentKey: event.target.value })}>
	                <option value="">请选择智能体</option>
	                {agentOptions.map((agent) => (
	                  <option key={agent.value} value={agent.value}>{agent.label}</option>
	                ))}
	              </select>
	            </div>
            <div className="field-group">
              <label htmlFor="schedule-team-input">TeamID</label>
              <UiInput id="schedule-team-input" inputSize="md" value={form.teamId} onChange={(event) => updateForm({ teamId: event.target.value })} />
            </div>
	            <div className="field-group">
	              <label htmlFor="schedule-zone-input">时区</label>
	              <select id="schedule-zone-input" value={form.zoneId} onChange={(event) => updateForm({ zoneId: event.target.value })}>
	                <option value="">默认时区</option>
	                {zoneOptions.map((zoneId) => (
	                  <option key={zoneId} value={zoneId}>{zoneId}</option>
	                ))}
	              </select>
	            </div>
            <div className="field-group">
              <label htmlFor="schedule-runs-input">剩余次数</label>
              <UiInput id="schedule-runs-input" inputSize="md" type="number" min="1" placeholder="留空表示无限次" value={form.remainingRuns} onChange={(event) => updateForm({ remainingRuns: event.target.value })} />
            </div>
          </div>

	          <div className="field-group">
	            <label htmlFor="schedule-description-input">描述</label>
	            <textarea id="schedule-description-input" className="settings-textarea" rows={2} value={form.description} onChange={(event) => updateForm({ description: event.target.value })} />
	          </div>

	          <fieldset className="schedule-request-box">
	            <legend>请求</legend>
	            <div className="field-group">
	              <label htmlFor="schedule-message-input">任务消息</label>
	              <textarea id="schedule-message-input" className="settings-textarea" rows={4} value={form.message} onChange={(event) => updateForm({ message: event.target.value })} />
	            </div>

	            <div className="schedule-form-grid">
	              <div className="field-group">
	                <label htmlFor="schedule-chat-input">ChatID</label>
	                <UiInput id="schedule-chat-input" inputSize="md" value={form.chatId} onChange={(event) => updateForm({ chatId: event.target.value })} />
	              </div>
	              <div className="field-group">
	                <label htmlFor="schedule-role-input">Role</label>
	                <UiInput id="schedule-role-input" inputSize="md" value={form.role} onChange={(event) => updateForm({ role: event.target.value })} />
	              </div>
	              <div className="field-group">
	                <label htmlFor="schedule-hidden-select">Hidden</label>
	                <select id="schedule-hidden-select" value={form.hidden} onChange={(event) => updateForm({ hidden: event.target.value as ScheduleFormState["hidden"] })}>
	                  <option value="">不传</option>
	                  <option value="true">true</option>
	                  <option value="false">false</option>
	                </select>
	              </div>
	              <div className="field-group schedule-enabled-field">
	                <label>
	                  <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm({ enabled: event.target.checked })} />
	                  启用任务
	                </label>
	              </div>
	            </div>

	            <div className="field-group">
	              <label htmlFor="schedule-params-input">Params JSON</label>
	              <textarea id="schedule-params-input" className="settings-textarea schedule-mono-textarea" rows={3} placeholder='{"kind":"daily"}' value={form.paramsText} onChange={(event) => updateForm({ paramsText: event.target.value })} />
	            </div>
	          </fieldset>

          {formError && <div className="settings-error">{formError}</div>}

          <div className="schedule-save-actions">
            <UiButton size="sm" variant="primary" onClick={saveForm} disabled={saving}>
              <MaterialIcon name="save" />
              <span>{formMode === "create" ? "创建任务" : "保存修改"}</span>
            </UiButton>
            {formMode === "edit" && (
              <UiButton size="sm" variant="ghost" onClick={startCreate} disabled={saving}>取消编辑</UiButton>
            )}
          </div>

          <div className="schedule-executions">
            <div className="schedule-executions-head">
              <strong>执行记录</strong>
              <UiButton size="sm" variant="ghost" onClick={() => loadExecutions(selectedId)} disabled={!selectedId || executionsLoading}>
                <MaterialIcon name="refresh" />
                <span>刷新</span>
              </UiButton>
            </div>
            <Spin spinning={executionsLoading}>
              {!selectedId ? (
                <div className="command-empty-state">保存或选择任务后查看执行记录。</div>
              ) : executions.length === 0 ? (
                <div className="command-empty-state">暂无执行记录。</div>
              ) : (
                <div className="schedule-execution-list">
                  {executions.map((item) => (
                    <div className="schedule-execution-row" key={item.id}>
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

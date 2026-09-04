import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import type {
  AutomationDetailResponse,
  AutomationQueryRequest,
  AutomationSummaryResponse,
  CreateAutomationRequest,
  UpdateAutomationRequest,
} from "@/shared/data";
import { toRunOwner } from "@/shared/data/runOwner";

export type AutomationFormMode = "create" | "edit";
export type AutomationEditorMode = "structured" | "source";
export type AutomationChatMode = "new" | "existing";
export type AutomationOptionalField =
  | "description"
  | "zoneId"
  | "role"
  | "hidden"
  | "paramsText";

export interface AutomationFormState {
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
  chatMode: AutomationChatMode;
  chatId: string;
  role: string;
  hidden: "" | "true" | "false";
  paramsText: string;
}

export interface AutomationCronPreset {
  labelKey: string;
  value: string;
  remainingRuns?: string;
}

export const EMPTY_AUTOMATION_FORM: AutomationFormState = {
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
  chatMode: "new",
  chatId: "",
  role: "",
  hidden: "",
  paramsText: "",
};

export const AUTOMATION_CRON_PRESETS: AutomationCronPreset[] = [
  { labelKey: "automationConsole.cronPreset.dailySevenPm", value: "0 19 * * *" },
  { labelKey: "automationConsole.cronPreset.weekdayNineThirty", value: "30 9 * * 1-5" },
  { labelKey: "automationConsole.cronPreset.everyTenMinutes", value: "*/10 * * * *" },
  { labelKey: "automationConsole.cronPreset.everyEightHours", value: "0 */8 * * *" },
  {
    labelKey: "automationConsole.cronPreset.nightTenPastTenOnce",
    value: "10 22 * * *",
    remainingRuns: "1",
  },
  { labelKey: "automationConsole.cronPreset.weekendNine", value: "0 9,21 * * 0,6" },
  { labelKey: "automationConsole.cronPreset.midMonthNoon", value: "0 12 5,15,25 * *" },
];

function compactPayload<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (next[key] === "" || next[key] === undefined) delete next[key];
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
    if (typeof value === "string" && value.trim()) return value.trim();
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

export function createInitialAutomationForm(
  currentWorker: CurrentWorkerSummary | null,
): AutomationFormState {
  return {
    ...EMPTY_AUTOMATION_FORM,
    agentKey: resolveDefaultAgentKey(currentWorker),
  };
}

export function automationFormFromDetail(
  automation: AutomationDetailResponse,
): AutomationFormState {
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
    chatMode: automation.query?.chatId ? "existing" : "new",
    chatId: automation.query?.chatId || "",
    role: automation.query?.role || "",
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

export function splitAutomationCronExpression(value: string): string[] {
  const exactFields = value.split(" ");
  if (exactFields.length === 5) return exactFields;
  const normalizedFields = value.trim() ? value.trim().split(/\s+/) : [];
  return Array.from({ length: 5 }, (_, index) => normalizedFields[index] || "");
}

export function buildDuplicateAutomationPayload(
  automation: AutomationDetailResponse,
  name: string,
): CreateAutomationRequest {
  const owner = toRunOwner(automation);
  return compactPayload({
    name: name.trim(),
    description: String(automation.description || "").trim(),
    cron: String(automation.cron || "").trim(),
    agentKey: owner?.kind === "agent" ? owner.agentKey : undefined,
    teamId: owner?.kind === "orchestrated-team" ? owner.teamId : undefined,
    zoneId: String(automation.zoneId || "").trim(),
    enabled: false,
    remainingRuns: automation.remainingRuns,
    query: {
      message: String(automation.query?.message || "").trim(),
      ...(automation.query?.chatId ? { chatId: automation.query.chatId } : {}),
      ...(automation.query?.role ? { role: automation.query.role } : {}),
      ...(automation.query?.params ? { params: { ...automation.query.params } } : {}),
      ...(automation.query?.hidden !== undefined
        ? { hidden: automation.query.hidden }
        : {}),
    },
  }) as CreateAutomationRequest;
}

export function automationSourcePath(
  automation: AutomationSummaryResponse,
): string {
  const source = String(automation.sourceFile || "").trim();
  if (!source) return automation.id;
  const normalized = source.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || automation.id;
}

export function isCurrentAutomationSourceRequest(
  requestSeq: number,
  currentSeq: number,
  targetId: string,
  selectedId: string,
): boolean {
  return requestSeq === currentSeq && targetId === selectedId;
}

function buildQuery(form: AutomationFormState): AutomationQueryRequest {
  const query: AutomationQueryRequest = { message: form.message.trim() };
  const role = form.role.trim();
  if (role) query.role = role;
  const chatId = form.chatMode === "existing" ? form.chatId.trim() : "";
  if (chatId) query.chatId = chatId;
  if (form.hidden === "true") query.hidden = true;
  if (form.hidden === "false") query.hidden = false;
  if (form.paramsText.trim()) {
    query.params = JSON.parse(form.paramsText) as Record<string, unknown>;
  }
  return query;
}

export function buildCreateAutomationPayloadForSubmit(
  form: AutomationFormState,
): CreateAutomationRequest {
  return compactPayload({
    name: form.name.trim(),
    description: form.description.trim(),
    cron: form.cron.trim(),
    agentKey: form.agentKey.trim(),
    zoneId: form.zoneId.trim(),
    enabled: form.enabled,
    remainingRuns: form.remainingRuns.trim()
      ? Number(form.remainingRuns.trim())
      : undefined,
    query: buildQuery(form),
  }) as CreateAutomationRequest;
}

export function buildUpdateAutomationPayloadForSubmit(
  form: AutomationFormState,
): UpdateAutomationRequest {
  const payload = compactPayload({
    id: form.id,
    name: form.name.trim(),
    cron: form.cron.trim(),
    agentKey: form.agentKey.trim(),
    zoneId: form.zoneId.trim(),
    enabled: form.enabled,
    remainingRuns: form.remainingRuns.trim()
      ? Number(form.remainingRuns.trim())
      : undefined,
    query: buildQuery(form),
  }) as UpdateAutomationRequest;
  return { ...payload, description: form.description.trim() };
}

export function validateAutomationForm(
  form: AutomationFormState,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!form.name.trim()) return t("automationConsole.error.nameRequired");
  if (!form.cron.trim()) return t("automationConsole.error.cronRequired");
  if (form.cron.trim().split(/\s+/).length !== 5) {
    return t("automationConsole.error.cronFormat");
  }
  if (!form.agentKey.trim()) return t("automationConsole.error.agentRequired");
  if (!form.message.trim()) return t("automationConsole.error.messageRequired");
  if (form.chatMode === "existing" && !form.chatId.trim()) {
    return t("automationConsole.error.chatIdRequired");
  }
  if (form.remainingRuns.trim()) {
    const runs = Number(form.remainingRuns.trim());
    if (!Number.isInteger(runs) || runs <= 0) {
      return t("automationConsole.error.remainingRunsPositive");
    }
  }
  if (form.paramsText.trim()) {
    try {
      const parsed = JSON.parse(form.paramsText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return t("automationConsole.error.paramsObject");
      }
    } catch (error) {
      return t("automationConsole.error.paramsJsonInvalid", {
        detail: (error as Error).message,
      });
    }
  }
  return "";
}

export function automationOptionalFieldHasValue(
  form: AutomationFormState,
  field: AutomationOptionalField,
): boolean {
  return form[field].trim().length > 0;
}

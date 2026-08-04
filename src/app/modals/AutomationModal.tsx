import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Checkbox, Input, Popconfirm, Select, Spin, Tooltip, message } from "antd";
import type { MenuProps } from "antd";
import type { Agent, Team } from "@/app/state/types";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  getAutomationExecutions,
  getAutomations,
  getAdminSource,
  toggleAutomation,
  updateAutomation,
  updateAdminSource,
} from "@/shared/data";
import { getAgents as getAgentsHttp } from "@/shared/data";
import type {
  CreateAutomationRequest,
  AutomationDetailResponse,
  AutomationExecutionResponse,
  AutomationQueryRequest,
  AutomationSummaryResponse,
  UpdateAutomationRequest,
  AdminSourceResponse,
} from "@/shared/data";
import {
  MaterialIcon,
  type MaterialIconName,
} from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { useI18n, type I18nContextValue } from "@/shared/i18n";
import { formatPlatformReadableTimeWithFallback } from "@/shared/utils/platformTime";

type AutomationStatusFilter = "all" | "enabled" | "disabled";
type AutomationFormMode = "create" | "edit";
type AutomationEditorMode = "structured" | "source";
type Translate = I18nContextValue["t"];

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
  { labelKey: "automationConsole.cronPreset.dailyNine", value: "0 9 * * *" },
  {
    labelKey: "automationConsole.cronPreset.weekdaySix",
    value: "0 18 * * 1-5",
  },
  {
    labelKey: "automationConsole.cronPreset.everyFiveMinutes",
    value: "*/5 * * * *",
  },
  { labelKey: "automationConsole.cronPreset.hourly", value: "0 * * * *" },
];
const AUTOMATION_CONSOLE_CLASS_NAME =
  "automation-console tw:overflow-hidden";
const AUTOMATION_ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const AUTOMATION_BODY_CLASS_NAME =
  "automation-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[minmax(280px,0.52fr)_minmax(480px,1.55fr)] tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const AUTOMATION_LIST_CLASS_NAME =
  "automation-console-list tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[260px]";
const AUTOMATION_TOOLBAR_CLASS_NAME =
  "automation-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2 tw:max-[860px]:grid-cols-[1fr_auto_auto] tw:[&_.ant-select]:min-w-0 tw:[&_.ant-select]:w-full tw:[&_select]:min-h-8 tw:[&_select]:w-full tw:[&_select]:rounded-control tw:[&_select]:border tw:[&_select]:px-2 tw:[&_select]:py-1.5 tw:[&_select]:text-xs tw:[&_select]:text-ink-1 tw:[&_select]:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:[&_select]:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))]";
const AUTOMATION_COUNT_CLASS_NAME =
  "automation-console-count tw:text-xs tw:text-ink-muted";
const AUTOMATION_LIST_SCROLL_CLASS_NAME =
  "automation-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto tw:pr-0.5";
const AUTOMATION_LIST_ITEMS_CLASS_NAME =
  "automation-list-items tw:flex tw:flex-col tw:gap-1.5";
const AUTOMATION_LIST_ITEM_CLASS_NAME =
  "automation-list-item tw:flex tw:w-full tw:flex-col tw:gap-[3px] tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const AUTOMATION_LIST_ITEM_HEAD_CLASS_NAME =
  "automation-list-item-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:[&_.ui-tag]:flex-none";
const AUTOMATION_LIST_ITEM_TITLE_CLASS_NAME =
  "automation-list-item-title tw:inline-flex tw:min-w-0 tw:flex-1 tw:items-baseline tw:gap-[5px] tw:overflow-hidden tw:whitespace-nowrap tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.35]";
const AUTOMATION_LIST_ITEM_OWNER_CLASS_NAME =
  "automation-list-item-owner tw:max-w-[42%] tw:flex-none tw:overflow-hidden tw:text-ellipsis tw:text-xs tw:leading-[1.35] tw:text-ink-muted";
const AUTOMATION_LIST_ITEM_META_CLASS_NAME =
  "automation-list-item-meta tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:text-[11px] tw:leading-[1.35] tw:text-ink-muted";
const AUTOMATION_LIST_ITEM_META_WORKER_CLASS_NAME =
  "automation-list-item-meta-worker tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-left";
const AUTOMATION_LIST_ITEM_META_CRON_CLASS_NAME =
  "automation-list-item-meta-cron tw:min-w-0 tw:flex-none tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-right tw:text-ink-muted";
const AUTOMATION_DETAIL_CLASS_NAME =
  "automation-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto tw:[&_.ant-select]:min-w-0 tw:[&_.ant-select]:w-full tw:[&_select]:min-h-8 tw:[&_select]:w-full tw:[&_select]:rounded-control tw:[&_select]:border tw:[&_select]:px-2 tw:[&_select]:py-1.5 tw:[&_select]:text-xs tw:[&_select]:text-ink-1 tw:[&_select]:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:[&_select]:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))]";
const AUTOMATION_DETAIL_HEAD_CLASS_NAME =
  "automation-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px]";
const AUTOMATION_ACTIONS_CLASS_NAME =
  "automation-detail-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const AUTOMATION_FORM_GRID_CLASS_NAME =
  "automation-form-grid tw:grid tw:grid-cols-3 tw:gap-3 tw:max-[860px]:grid-cols-1 tw:[&_.field-group]:mb-0";
const AUTOMATION_FORM_FULL_WIDTH_CLASS_NAME =
  "field-group automation-form-full-width tw:col-span-3 tw:max-[860px]:col-span-1";
const AUTOMATION_CRON_CONTROL_CLASS_NAME =
  "automation-cron-control tw:grid tw:grid-cols-[minmax(0,1fr)_132px] tw:items-center tw:gap-2 tw:[&_.ant-select]:min-w-0 tw:[&_select]:min-w-0";
const AUTOMATION_ENABLED_FIELD_CLASS_NAME =
  "field-group automation-enabled-field tw:flex tw:items-end tw:[&_.ant-checkbox-wrapper]:flex tw:[&_.ant-checkbox-wrapper]:min-h-8 tw:[&_.ant-checkbox-wrapper]:items-center tw:[&_.ant-checkbox-wrapper]:gap-2 tw:[&_.ant-checkbox-wrapper]:m-0 tw:[&_input]:w-auto tw:[&_label]:m-0 tw:[&_label]:flex tw:[&_label]:min-h-8 tw:[&_label]:items-center tw:[&_label]:gap-2 tw:[&_label]:normal-case tw:[&_label]:tracking-normal";
const AUTOMATION_MONO_TEXTAREA_CLASS_NAME =
  "settings-textarea automation-mono-textarea tw:font-code";
const AUTOMATION_SOURCE_EDITOR_CLASS_NAME =
  "settings-textarea automation-source-editor tw:min-h-0 tw:flex-1 tw:resize-none tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80 tw:max-[860px]:flex-none tw:max-[860px]:resize-y";
const AUTOMATION_SAVE_ACTIONS_CLASS_NAME =
  "automation-save-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const AUTOMATION_EXECUTIONS_CLASS_NAME =
  "automation-executions";
const AUTOMATION_EXECUTIONS_HEAD_CLASS_NAME =
  "automation-executions-head tw:mb-2 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2";
const AUTOMATION_EXECUTION_LIST_CLASS_NAME =
  "automation-execution-list tw:flex tw:flex-col tw:gap-1";
const AUTOMATION_EXECUTION_ROW_CLASS_NAME =
  "automation-execution-row tw:grid tw:grid-cols-[82px_1.1fr_70px_minmax(120px,1fr)] tw:items-center tw:gap-2 tw:rounded-[var(--radius-sm)] tw:bg-[color-mix(in_srgb,var(--bg-input)_55%,transparent)] tw:px-2 tw:py-[7px] tw:text-[11px] tw:text-ink-muted tw:max-[860px]:grid-cols-1 tw:[&>span]:min-w-0 tw:[&>span]:overflow-hidden tw:[&>span]:text-ellipsis tw:[&>span]:whitespace-nowrap";
const AUTOMATION_SECTION_NAV_CLASS_NAME =
  "automation-section-nav tw:sticky tw:top-0 tw:flex tw:items-center";
const AUTOMATION_SECTION_NAV_LINKS_CLASS_NAME =
  "automation-section-nav-links tw:flex tw:min-w-0 tw:flex-1 tw:overflow-x-auto";
const AUTOMATION_SECTION_NAV_LINK_CLASS_NAME =
  "automation-section-nav-link tw:flex-none tw:whitespace-nowrap";
const AUTOMATION_SECTION_NAV_SAVE_CLASS_NAME =
  "automation-section-nav-save tw:ml-auto tw:flex-none";
const AUTOMATION_FORM_SECTION_CLASS_NAME = "automation-form-section";
const AUTOMATION_FORM_SECTION_HEADING_CLASS_NAME =
  "automation-form-section-heading tw:flex tw:items-center tw:gap-1.5";

export const AUTOMATION_FORM_SECTION_IDS = [
  "automation-section-basic",
  "automation-section-query",
  "automation-section-executions",
] as const;

type AutomationFormSectionId = (typeof AUTOMATION_FORM_SECTION_IDS)[number];

export function resolveActiveAutomationFormSection(
  sectionTops: number[],
  activationLine: number,
  atBottom: boolean,
): AutomationFormSectionId {
  if (atBottom) {
    return AUTOMATION_FORM_SECTION_IDS[AUTOMATION_FORM_SECTION_IDS.length - 1];
  }
  let activeSection: AutomationFormSectionId = AUTOMATION_FORM_SECTION_IDS[0];
  AUTOMATION_FORM_SECTION_IDS.forEach((sectionId, index) => {
    if (sectionTops[index] <= activationLine) activeSection = sectionId;
  });
  return activeSection;
}

const AutomationFormSection: React.FC<{
  active?: boolean;
  children: React.ReactNode;
  icon: MaterialIconName;
  id: AutomationFormSectionId;
  title: string;
}> = ({ active = false, children, icon, id, title }) => {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className={`${AUTOMATION_FORM_SECTION_CLASS_NAME} ${active ? "is-active" : ""}`}
      aria-labelledby={titleId}
    >
      <div className={AUTOMATION_FORM_SECTION_HEADING_CLASS_NAME}>
        <MaterialIcon name={icon} />
        <h3 id={titleId}>{title}</h3>
      </div>
      {children}
    </section>
  );
};

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

const AUTOMATION_ROLE_OPTIONS = ["user", "assistant", "system"];

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
  };
}

function formFromAutomation(
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
      automation.remainingRuns === undefined ||
      automation.remainingRuns === null
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

export function automationTimeLabel(
  readable?: string | null,
  fallbackEpochMillis?: number | null,
  locale?: string,
): string {
  return formatPlatformReadableTimeWithFallback(
    readable,
    fallbackEpochMillis,
    locale,
  );
}

function toDurationLabel(value?: number | null): string {
  if (value === undefined || value === null) return "--";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function automationSourcePath(
  automation: AutomationSummaryResponse,
): string {
  const source = String(automation.sourceFile || "").trim();
  if (!source) return automation.id;
  const normalized = source.replace(/\\/g, "/");
  const filename = normalized.split("/").filter(Boolean).pop();
  return filename || automation.id;
}

export function isCurrentAutomationSourceRequest(
  requestSeq: number,
  currentSeq: number,
  targetId: string,
  selectedId: string,
): boolean {
  return requestSeq === currentSeq && targetId === selectedId;
}

export function shouldShowAutomationExecutions(
  editorMode: AutomationEditorMode,
): boolean {
  return editorMode === "structured";
}

function automationListMeta(
  automation: AutomationSummaryResponse,
  resolveWorkerName: (automation: AutomationSummaryResponse) => string,
): string {
  const workerName = resolveWorkerName(automation) || "--";
  const cron = String(automation.cron || "").trim() || "--";
  return `${workerName} · ${cron}`;
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
  return compactPayload({
    id: form.id,
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
  }) as UpdateAutomationRequest;
}

function validateForm(form: AutomationFormState, t: Translate): string {
  if (!form.name.trim()) return t("automationConsole.error.nameRequired");
  if (!form.description.trim())
    return t("automationConsole.error.descriptionRequired");
  if (!form.cron.trim()) return t("automationConsole.error.cronRequired");
  if (!isFiveFieldCron(form.cron))
    return t("automationConsole.error.cronFormat");
  if (!form.agentKey.trim()) return t("automationConsole.error.agentRequired");
  if (!form.message.trim()) return t("automationConsole.error.messageRequired");
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

export function shouldStartAutomationConsoleBootstrap(
  ref: React.MutableRefObject<boolean>,
): boolean {
  if (ref.current) return false;
  ref.current = true;
  return true;
}

export function shouldLoadAutomationAgents(
  ref: React.MutableRefObject<boolean>,
  agents: Agent[],
): boolean {
  if (ref.current) return false;
  if (Array.isArray(agents) && agents.length > 0) return false;
  ref.current = true;
  return true;
}

export async function fetchAutomationAgentsForSelect(): Promise<Agent[]> {
  const response = await getAgentsHttp();
  return Array.isArray(response.data) ? (response.data as Agent[]) : [];
}

export const AutomationModal: React.FC<{
  currentWorker: CurrentWorkerSummary | null;
  agents: Agent[];
  teams: Team[];
  embedded?: boolean;
}> = ({ currentWorker, agents, teams, embedded = false }) => {
  const { locale, t } = useI18n();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const automations = state.automations;
  const [selectedId, setSelectedId] = useState("");
  const [executions, setExecutions] = useState<AutomationExecutionResponse[]>(
    [],
  );
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AutomationStatusFilter>("all");
  const [workerFilter, setWorkerFilter] = useState("");
  const [formMode, setFormMode] = useState<AutomationFormMode>("create");
  const [editorMode, setEditorMode] = useState<AutomationEditorMode>("structured");
  const [activeSectionId, setActiveSectionId] =
    useState<AutomationFormSectionId>(AUTOMATION_FORM_SECTION_IDS[0]);
  const [form, setForm] = useState<AutomationFormState>(() =>
    createInitialForm(currentWorker),
  );
  const [loading, setLoading] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceSha256, setSourceSha256] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [sourceLoadedId, setSourceLoadedId] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const didBootstrapAutomationsRef = useRef(false);
  const didBootstrapAgentsRef = useRef(false);
  const didAutoSelectInitialAutomationRef = useRef(false);
  const sourceLoadSeqRef = useRef(0);
  const selectedAutomationIdRef = useRef(selectedId);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const sectionNavLinksRef = useRef<HTMLDivElement>(null);

  const formSections = useMemo(
    () => [
      {
        id: AUTOMATION_FORM_SECTION_IDS[0],
        label: t("automationConsole.section.basic"),
      },
      {
        id: AUTOMATION_FORM_SECTION_IDS[1],
        label: t("automationConsole.section.queryParams"),
      },
      {
        id: AUTOMATION_FORM_SECTION_IDS[2],
        label: t("automationConsole.section.executions"),
      },
    ],
    [t],
  );

  const handleSectionNavigate = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      sectionId: AutomationFormSectionId,
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

  const workerOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const item of automations) {
      if (item.agentKey)
        values.set(
          `agent:${item.agentKey}`,
          t("automationConsole.worker.agent", { id: item.agentKey }),
        );
      if (item.teamId)
        values.set(
          `team:${item.teamId}`,
          t("automationConsole.worker.team", { id: item.teamId }),
        );
    }
    return Array.from(values.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [automations, t]);

  const cronPresetOptions = useMemo(
    () =>
      CRON_PRESETS.map((preset) => ({
        value: preset.value,
        label: t(preset.labelKey),
      })),
    [t],
  );

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
      return left.localeCompare(right, locale);
    });
  }, [form.zoneId, locale]);

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

  const loadAgentsForAutomation = useCallback(async () => {
    try {
      const nextAgents = await fetchAutomationAgentsForSelect();
      dispatch({ type: "SET_AGENTS", agents: nextAgents });
    } catch (error) {
      setError((error as Error).message);
    }
  }, [dispatch]);

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
    sourceLoadSeqRef.current += 1;
    selectedAutomationIdRef.current = "";
    didAutoSelectInitialAutomationRef.current = true;
    setSelectedId("");
    setFormMode("create");
    setEditorMode("structured");
    setForm(createInitialForm(currentWorker));
    setSourceDraft("");
    setSourceSha256("");
    setSourcePath("");
    setSourceLoadedId("");
    setSourceDirty(false);
    setExecutions([]);
    setFormError("");
  }, [currentWorker]);

  const selectAutomation = useCallback(
    async (id: string) => {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) {
        startCreate();
        return;
      }
      sourceLoadSeqRef.current += 1;
      selectedAutomationIdRef.current = normalizedId;
      setSelectedId(normalizedId);
      setFormMode("edit");
      setEditorMode("structured");
      setSourceDraft("");
      setSourceSha256("");
      setSourcePath("");
      setSourceLoadedId("");
      setSourceDirty(false);
      setFormError("");
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
    selectedAutomationIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    setActiveSectionId(AUTOMATION_FORM_SECTION_IDS[0]);
  }, [editorMode, formMode, selectedId]);

  useEffect(() => {
    if (editorMode !== "structured") return;
    const scrollContainer = detailScrollRef.current;
    if (!scrollContainer) return;

    let animationFrame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const nav = scrollContainer.querySelector<HTMLElement>(
          ".automation-section-nav",
        );
        const activationLine =
          (nav?.getBoundingClientRect().bottom ??
            scrollContainer.getBoundingClientRect().top) + 8;
        const sectionTops = AUTOMATION_FORM_SECTION_IDS.map((sectionId) => {
          const section = scrollContainer.querySelector<HTMLElement>(
            `#${sectionId}`,
          );
          return section?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
        });
        const atBottom =
          scrollContainer.scrollTop + scrollContainer.clientHeight >=
          scrollContainer.scrollHeight - 2;
        const nextSectionId = resolveActiveAutomationFormSection(
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
  }, [editorMode, executions.length, formMode, selectedId]);

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

  useEffect(() => {
    if (!shouldStartAutomationConsoleBootstrap(didBootstrapAutomationsRef))
      return;
    void loadAutomations(selectedId);
  }, [loadAutomations, selectedId]);

  useEffect(() => {
    if (!shouldLoadAutomationAgents(didBootstrapAgentsRef, agents)) return;
    void loadAgentsForAutomation();
  }, [agents, loadAgentsForAutomation]);

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
    const validation = validateForm(form, t);
    if (validation) {
      setFormError(validation);
      return;
    }
    setSavingForm(true);
    setError("");
    setFormError("");
    try {
      const response =
        formMode === "create"
          ? await createAutomation(buildCreateAutomationPayloadForSubmit(form))
          : await updateAutomation(buildUpdateAutomationPayloadForSubmit(form));
      await loadAutomations(response.data.id);
      message.success(t("automationConsole.message.saveSuccess"));
    } catch (error) {
      const errorMessage = (error as Error).message;
      setFormError(errorMessage);
      message.error(t("automationConsole.message.saveFailed", { detail: errorMessage }));
    } finally {
      setSavingForm(false);
    }
  };

  const applySourceResponse = (response: AdminSourceResponse) => {
    setSourceDraft(response.content);
    setSourceSha256(response.sha256);
    setSourcePath(response.source?.path || "");
    setSourceLoadedId(response.target.key || "");
    setSourceDirty(false);
  };

  const toggleEditorMode = async () => {
    if (formMode !== "edit" || !selectedId) return;
    if (editorMode === "source") {
      setEditorMode("structured");
      return;
    }
    const id = selectedId;
    setEditorMode("source");
    if (sourceLoadedId === id) return;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setLoadingSource(true);
    setFormError("");
    try {
      const response = await getAdminSource({ type: "automation", key: id });
      if (!isCurrentAutomationSourceRequest(
        requestSeq,
        sourceLoadSeqRef.current,
        id,
        selectedAutomationIdRef.current,
      )) {
        return;
      }
      applySourceResponse(response.data);
    } catch (sourceError) {
      if (!isCurrentAutomationSourceRequest(
        requestSeq,
        sourceLoadSeqRef.current,
        id,
        selectedAutomationIdRef.current,
      )) {
        return;
      }
      setFormError(sourceError instanceof Error ? sourceError.message : String(sourceError));
    } finally {
      if (sourceLoadSeqRef.current === requestSeq) {
        setLoadingSource(false);
      }
    }
  };

  const saveSource = async () => {
    if (!selectedId || sourceLoadedId !== selectedId || !sourceDirty) return;
    const id = selectedId;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setSavingForm(true);
    setError("");
    setFormError("");
    try {
      const response = await updateAdminSource({
        target: { type: "automation", key: id },
        content: sourceDraft,
        baseSha256: sourceSha256 || undefined,
      });
      if (isCurrentAutomationSourceRequest(
        requestSeq,
        sourceLoadSeqRef.current,
        id,
        selectedAutomationIdRef.current,
      )) {
        applySourceResponse(response.data);
      }
      const [detailResponse, listResponse] = await Promise.all([
        getAutomation(id),
        getAutomations(),
      ]);
      dispatch({ type: "SET_AUTOMATIONS", automations: listResponse.data.items || [] });
      if (isCurrentAutomationSourceRequest(
        requestSeq,
        sourceLoadSeqRef.current,
        id,
        selectedAutomationIdRef.current,
      )) {
        setForm(formFromAutomation(detailResponse.data));
      }
    } catch (sourceError) {
      setFormError(sourceError instanceof Error ? sourceError.message : String(sourceError));
    } finally {
      setSavingForm(false);
    }
  };

  const toggleSelected = async (item: AutomationSummaryResponse) => {
    setSavingToggle(true);
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
      setSavingToggle(false);
    }
  };

  const confirmDelete = async (item: AutomationSummaryResponse) => {
    setDeleting(true);
    setError("");
    try {
      await deleteAutomation({ id: item.id });
      const remaining = automations.filter((row) => row.id !== item.id);
      dispatch({ type: "SET_AUTOMATIONS", automations: remaining });
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
      setDeleting(false);
    }

  };

  const statusMenu: MenuProps = useMemo(
    () => ({
      onClick: (info) => setStatusFilter(info.key as AutomationStatusFilter),
      selectedKeys: [statusFilter],
      items: [
        { key: "all", label: t("automationConsole.filter.status.all") },
        { key: "enabled", label: t("automationConsole.filter.status.enabled") },
        {
          key: "disabled",
          label: t("automationConsole.filter.status.disabled"),
        },
      ],
    }),
    [t, statusFilter],
  );

  const workerMenu: MenuProps = useMemo(
    () => ({
      onClick: (info) => setWorkerFilter(info.key),
      selectedKeys: [workerFilter],
      items: [
        { key: "", label: t("automationConsole.filter.worker.all") },
        ...workerOptions.map((opt) => ({
          key: opt.value,
          label: opt.label,
        })),
      ],
    }),
    [t, workerFilter, workerOptions],
  );

  return (
    <div
      className={`${embedded ? "command-modal-section" : "management-page-console"} ${AUTOMATION_CONSOLE_CLASS_NAME}`}
    >
      {error && (
        <div className={AUTOMATION_ERROR_CLASS_NAME}>
          <span>{error}</span>
          <UiButton
            size="sm"
            variant="ghost"
            onClick={() => loadAutomations(selectedId)}
          >
            {t("automationConsole.action.retry")}
          </UiButton>
        </div>
      )}

      <div className={AUTOMATION_BODY_CLASS_NAME}>
        <div className={AUTOMATION_LIST_CLASS_NAME}>
          <div className={AUTOMATION_TOOLBAR_CLASS_NAME}>
            <SearchFilterBar
              searchText={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder={t("automationConsole.searchPlaceholder")}
              filters={[
                {
                  key: "status",
                  label: t("automationConsole.filter.status.all"),
                  icon: "filter_list",
                  active: statusFilter !== "all",
                  open: statusDropdownOpen,
                  onOpenChange: setStatusDropdownOpen,
                  menu: statusMenu,
                },
                {
                  key: "worker",
                  label: t("automationConsole.filter.worker.all"),
                  icon: "person",
                  active: workerFilter !== "",
                  open: workerDropdownOpen,
                  onOpenChange: setWorkerDropdownOpen,
                  menu: workerMenu,
                },
              ]}
            />
            <UiButton
              size="sm"
              variant="ghost"
              iconOnly
              onClick={() => loadAutomations(selectedId)}
              disabled={savingForm || deleting || savingToggle}
              loading={loading}
              aria-label={t("automationConsole.action.refresh")}
            >
              <MaterialIcon name="refresh" />
            </UiButton>
            <UiButton
              size="sm"
              variant="primary"
              iconOnly
              onClick={startCreate}
              aria-label={t("automationConsole.action.new")}
            >
              <MaterialIcon name="add" />
            </UiButton>
          </div>
          <div className={AUTOMATION_COUNT_CLASS_NAME}>
            {t("automationConsole.list.count", { count: automations.length })}
          </div>
          <div className={AUTOMATION_LIST_SCROLL_CLASS_NAME}>
            <Spin spinning={loading}>
              {filteredAutomations.length === 0 ? (
                <div className="command-empty-state">
                  {t("automationConsole.empty")}
                  <UiButton size="sm" variant="primary" onClick={startCreate}>
                    {t("automationConsole.action.create")}
                  </UiButton>
                </div>
              ) : (
                <div className={AUTOMATION_LIST_ITEMS_CLASS_NAME}>
                  {filteredAutomations.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${AUTOMATION_LIST_ITEM_CLASS_NAME} ${item.id === selectedId ? "is-active" : ""}`}
                      onClick={() => selectAutomation(item.id)}
                    >
                      <span className={AUTOMATION_LIST_ITEM_HEAD_CLASS_NAME}>
                        <span
                          className={AUTOMATION_LIST_ITEM_TITLE_CLASS_NAME}
                          title={item.name || item.id}
                        >
                          <strong>{item.name || item.id}</strong>
                        </span>
                        <UiTag tone={item.enabled ? "accent" : "muted"}>
                          {item.enabled
                            ? t("automationConsole.status.enabled")
                            : t("automationConsole.status.disabled")}
                        </UiTag>
                      </span>
                      <span
                        className={AUTOMATION_LIST_ITEM_META_CLASS_NAME}
                        title={automationListMeta(
                          item,
                          getAutomationWorkerName,
                        )}
                      >
                        <span
                          className={
                            AUTOMATION_LIST_ITEM_META_WORKER_CLASS_NAME
                          }
                          title={getAutomationWorkerName(item) || "--"}
                        >
                          {getAutomationWorkerName(item) || "--"}
                        </span>
                        <span
                          className={AUTOMATION_LIST_ITEM_META_CRON_CLASS_NAME}
                          title={String(item.cron || "").trim() || "--"}
                        >
                          {String(item.cron || "").trim() || "--"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Spin>
          </div>
        </div>

        <div
          ref={detailScrollRef}
          className={`${AUTOMATION_DETAIL_CLASS_NAME} ${editorMode === "source" ? "is-source-editor" : ""}`}
        >
          <div className={AUTOMATION_DETAIL_HEAD_CLASS_NAME}>
            <div>
              <strong>
                {formMode === "create"
                  ? t("automationConsole.detail.titleCreate")
                  : selectedSummary?.name ||
                    t("automationConsole.detail.titleEdit")}
              </strong>
              <span className="tw:text-text-muted">
                {formMode === "create"
                  ? t("automationConsole.detail.createSubtitle")
                  : selectedSummary
                    ? sourcePath || automationSourcePath(selectedSummary)
                    : selectedId}
              </span>
            </div>
            {selectedSummary && (
              <div className={AUTOMATION_ACTIONS_CLASS_NAME}>
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => { void toggleEditorMode(); }}
                  disabled={savingForm || deleting || savingToggle}
                  loading={loadingSource}
                >
                  <MaterialIcon name={editorMode === "source" ? "tune" : "code"} />
                  <span>
                    {editorMode === "source"
                      ? t("automationConsole.action.structuredEdit")
                      : t("automationConsole.action.sourceEdit")}
                  </span>
                </UiButton>
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleSelected(selectedSummary)}
                  disabled={savingForm || deleting}
                  loading={savingToggle}
                >
                  <MaterialIcon
                    name={
                      selectedSummary.enabled ? "pause_circle" : "play_circle"
                    }
                  />
                  <span>
                    {selectedSummary.enabled
                      ? t("automationConsole.action.disable")
                      : t("automationConsole.action.enable")}
                  </span>
                </UiButton>
                <Popconfirm
                  title={t("automationConsole.confirm.deleteTitle")}
                  okText={t("automationConsole.confirm.deleteOk")}
                  cancelText={t("automationConsole.confirm.deleteCancel")}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => confirmDelete(selectedSummary)}
                  disabled={savingForm || deleting || savingToggle}
                >
                  <UiButton
                    size="sm"
                    variant="danger"
                    disabled={savingForm || savingToggle}
                    loading={deleting}
                  >
                    <MaterialIcon name="delete" />
                    <span>{t("automationConsole.action.delete")}</span>
                  </UiButton>
                </Popconfirm>
              </div>
            )}
          </div>

          {editorMode === "structured" && (
            <nav
              className={AUTOMATION_SECTION_NAV_CLASS_NAME}
              aria-label={t("automationConsole.sectionNav.ariaLabel")}
            >
              <div
                ref={sectionNavLinksRef}
                className={AUTOMATION_SECTION_NAV_LINKS_CLASS_NAME}
              >
                {formSections.map((section) => (
                  <a
                    className={AUTOMATION_SECTION_NAV_LINK_CLASS_NAME}
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
              {formMode === "edit" && (
                <UiButton
                  className={AUTOMATION_SECTION_NAV_SAVE_CLASS_NAME}
                  size="sm"
                  variant="primary"
                  onClick={saveForm}
                  disabled={deleting || savingToggle}
                  loading={savingForm}
                >
                  <MaterialIcon name="save" />
                  <span>{t("automationConsole.action.saveChanges")}</span>
                </UiButton>
              )}
            </nav>
          )}

          {editorMode === "source" ? (
            <div className="automation-source-workspace">
              <div className="field-group automation-source-field">
                <label htmlFor="automation-source-editor">
                  {t("automationConsole.field.sourceFile")}
                </label>
                <Input.TextArea
                  id="automation-source-editor"
                  className={AUTOMATION_SOURCE_EDITOR_CLASS_NAME}
                  value={sourceDraft}
                  onChange={(event) => {
                    setSourceDraft(event.target.value);
                    setSourceDirty(true);
                    setFormError("");
                  }}
                />
              </div>
              {formError && <div className="settings-error">{formError}</div>}
              <div className={AUTOMATION_SAVE_ACTIONS_CLASS_NAME}>
                <UiButton
                  size="sm"
                  variant="primary"
                  onClick={saveSource}
                  disabled={deleting || savingToggle || loadingSource || !sourceDirty || sourceLoadedId !== selectedId}
                  loading={savingForm}
                >
                  <MaterialIcon name="save" />
                  <span>{t("automationConsole.action.saveSource")}</span>
                </UiButton>
                {sourceDirty && (
                  <span className="automation-source-dirty tw:text-[11px] tw:text-ink-muted">
                    {t("automationConsole.message.unsaved")}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              <AutomationFormSection
                active={activeSectionId === AUTOMATION_FORM_SECTION_IDS[0]}
                id={AUTOMATION_FORM_SECTION_IDS[0]}
                icon="settings"
                title={t("automationConsole.section.basic")}
              >
                <div className={AUTOMATION_FORM_GRID_CLASS_NAME}>
                  <div className="field-group">
                    <label htmlFor="automation-name-input">
                      {t("automationConsole.field.name")}
                    </label>
                    <Input
                      id="automation-name-input"
                      value={form.name}
                      onChange={(event) =>
                        updateForm({ name: event.target.value })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="automation-cron-input">Cron</label>
                    <div className={AUTOMATION_CRON_CONTROL_CLASS_NAME}>
                      <Input
                        id="automation-cron-input"
                        value={form.cron}
                        onChange={(event) =>
                          updateForm({ cron: event.target.value })
                        }
                      />
                      <Select
                        aria-label={t(
                          "automationConsole.cronPreset.ariaLabel",
                        )}
                        value={
                          CRON_PRESETS.some(
                            (preset) => preset.value === form.cron,
                          )
                            ? form.cron
                            : ""
                        }
                        onChange={(value) => {
                          if (value) updateForm({ cron: value });
                        }}
                        options={[
                          {
                            value: "",
                            label: t(
                              "automationConsole.cronPreset.placeholder",
                            ),
                          },
                          ...cronPresetOptions,
                        ]}
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <label htmlFor="automation-agent-input">
                      {t("automationConsole.field.agent")}
                    </label>
                    <Select
                      id="automation-agent-input"
                      showSearch
                      optionFilterProp="label"
                      value={form.agentKey}
                      onChange={(value) => updateForm({ agentKey: value })}
                      options={[
                        {
                          value: "",
                          label: t(
                            "automationConsole.field.agentPlaceholder",
                          ),
                        },
                        ...agentOptions,
                      ]}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="automation-zone-input">
                      {t("automationConsole.field.timezone")}
                    </label>
                    <Select
                      id="automation-zone-input"
                      value={form.zoneId}
                      onChange={(value) => updateForm({ zoneId: value })}
                      options={[
                        {
                          value: "",
                          label: t(
                            "automationConsole.field.defaultTimezone",
                          ),
                        },
                        ...zoneOptions.map((zoneId) => ({
                          value: zoneId,
                          label: zoneId,
                        })),
                      ]}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="automation-runs-input">
                      {t("automationConsole.field.remainingRuns")}
                    </label>
                    <Input
                      id="automation-runs-input"
                      type="number"
                      min="1"
                      placeholder={t(
                        "automationConsole.field.remainingRunsPlaceholder",
                      )}
                      value={form.remainingRuns}
                      onChange={(event) =>
                        updateForm({ remainingRuns: event.target.value })
                      }
                    />
                  </div>
                  <div className={AUTOMATION_ENABLED_FIELD_CLASS_NAME}>
                    <Checkbox
                      checked={form.enabled}
                      onChange={(event) =>
                        updateForm({ enabled: event.target.checked })
                      }
                    >
                      {t("automationConsole.field.enabled")}
                    </Checkbox>
                  </div>
                  <div className={AUTOMATION_FORM_FULL_WIDTH_CLASS_NAME}>
                    <label htmlFor="automation-description-input">
                      {t("automationConsole.field.description")}
                    </label>
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
                </div>
              </AutomationFormSection>

              <AutomationFormSection
                active={activeSectionId === AUTOMATION_FORM_SECTION_IDS[1]}
                id={AUTOMATION_FORM_SECTION_IDS[1]}
                icon="data_object"
                title={t("automationConsole.section.queryParams")}
              >
                <div className={AUTOMATION_FORM_GRID_CLASS_NAME}>
                  <div className={AUTOMATION_FORM_FULL_WIDTH_CLASS_NAME}>
                    <label htmlFor="automation-message-input">
                      {t("automationConsole.field.message")}
                    </label>
                    <Input.TextArea
                      id="automation-message-input"
                      rows={4}
                      value={form.message}
                      onChange={(event) =>
                        updateForm({ message: event.target.value })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="automation-chat-input">
                      {t("automationConsole.field.chatId")}
                    </label>
                    <Input
                      id="automation-chat-input"
                      value={form.chatId}
                      onChange={(event) =>
                        updateForm({ chatId: event.target.value })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="automation-role-input">
                      {t("automationConsole.field.role")}
                    </label>
                    <Select
                      id="automation-role-input"
                      value={form.role}
                      onChange={(value) => updateForm({ role: value })}
                      options={AUTOMATION_ROLE_OPTIONS.map((role) => ({
                        value: role,
                        label: role,
                      }))}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="automation-hidden-select">
                      {t("automationConsole.field.hidden")}
                    </label>
                    <Select
                      id="automation-hidden-select"
                      value={form.hidden}
                      onChange={(value) => updateForm({ hidden: value })}
                      options={[
                        {
                          value: "",
                          label: t("automationConsole.hidden.unset"),
                        },
                        {
                          value: "true",
                          label: t("automationConsole.hidden.true"),
                        },
                        {
                          value: "false",
                          label: t("automationConsole.hidden.false"),
                        },
                      ]}
                    />
                  </div>
                  <div className={AUTOMATION_FORM_FULL_WIDTH_CLASS_NAME}>
                    <label htmlFor="automation-params-input">
                      <span>{t("automationConsole.field.params")}</span>
                      <Tooltip
                        title={t("automationConsole.field.paramsTooltip")}
                        arrow={false}
                      >
                        <MaterialIcon name="help" />
                      </Tooltip>
                    </label>
                    <Input.TextArea
                      id="automation-params-input"
                      className={AUTOMATION_MONO_TEXTAREA_CLASS_NAME}
                      rows={3}
                      placeholder='{"kind":"daily"}'
                      value={form.paramsText}
                      onChange={(event) =>
                        updateForm({ paramsText: event.target.value })
                      }
                    />
                  </div>
                </div>
              </AutomationFormSection>

              {formError && <div className="settings-error">{formError}</div>}

              <div className={AUTOMATION_SAVE_ACTIONS_CLASS_NAME}>
                {formMode === "create" && (
                  <UiButton
                    size="sm"
                    variant="primary"
                    onClick={saveForm}
                    disabled={deleting || savingToggle}
                    loading={savingForm}
                  >
                    <MaterialIcon name="save" />
                    <span>{t("automationConsole.action.create")}</span>
                  </UiButton>
                )}
                {formMode === "edit" && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    onClick={startCreate}
                    disabled={savingForm || deleting || savingToggle}
                  >
                    {t("automationConsole.action.cancelEdit")}
                  </UiButton>
                )}
              </div>

              <AutomationFormSection
                active={activeSectionId === AUTOMATION_FORM_SECTION_IDS[2]}
                id={AUTOMATION_FORM_SECTION_IDS[2]}
                icon="history"
                title={t("automationConsole.section.executions")}
              >
                <div className={AUTOMATION_EXECUTIONS_CLASS_NAME}>
                  <div className={AUTOMATION_EXECUTIONS_HEAD_CLASS_NAME}>
                    <span>{t("automationConsole.executions.title")}</span>
                    <UiButton
                      size="sm"
                      variant="ghost"
                      onClick={() => loadExecutions(selectedId)}
                      disabled={!selectedId || executionsLoading}
                    >
                      <MaterialIcon name="refresh" />
                      <span>{t("automationConsole.action.refresh")}</span>
                    </UiButton>
                  </div>
                  <Spin spinning={executionsLoading}>
                    {!selectedId ? (
                      <div className="command-empty-state">
                        {t("automationConsole.executions.emptyNoSelection")}
                      </div>
                    ) : executions.length === 0 ? (
                      <div className="command-empty-state">
                        {t("automationConsole.executions.empty")}
                      </div>
                    ) : (
                      <div className={AUTOMATION_EXECUTION_LIST_CLASS_NAME}>
                        {executions.map((item) => (
                          <div
                            className={AUTOMATION_EXECUTION_ROW_CLASS_NAME}
                            key={item.id}
                          >
                            <span>{item.status}</span>
                            <span>
                              {automationTimeLabel(
                                item.startedTime,
                                item.startedAt,
                                locale,
                              )}
                            </span>
                            <span>{toDurationLabel(item.durationMs)}</span>
                            <span>{item.error || "--"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Spin>
                </div>
              </AutomationFormSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

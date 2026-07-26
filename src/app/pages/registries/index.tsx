import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Spin } from "antd";
import type { MenuProps } from "antd";
import {
  getAdminRegistries,
  getAdminSource,
  updateAdminSource,
  validateAdminRegistry,
  getAdminTools,
} from "@/shared/data";
import type {
  AdminRegistryCategory,
  AdminRegistryDetailResponse,
  AdminRegistryListDiagnostic,
  AdminRegistryListItem,
  AdminRegistryStatus,
  AdminRegistrySummary,
  AdminSourceResponse,
  AdminToolSummary,
  RegistryConsoleTab,
} from "@/shared/data";
import { useI18n, type I18nContextValue } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { formatEpochMillisLocal } from "@/shared/utils/platformTime";
import { isMcpTool } from "@/features/registries/lib/mcpRegistry";

type StatusFilter = "all" | AdminRegistryStatus;
type Translate = I18nContextValue["t"];
type RegistryEditableCategory = Exclude<AdminRegistryCategory, "mcp-servers">;

function translateWithFallback(
  t: Translate,
  key: string,
  fallback: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

const REGISTRY_CATEGORIES: RegistryEditableCategory[] = [
  "providers",
  "models",
  "viewport-servers",
];

const CATEGORIES: RegistryConsoleTab[] = [
  ...REGISTRY_CATEGORIES,
  "tools",
];

const STATUS_FILTERS: StatusFilter[] = ["all", "ready", "invalid", "disabled"];
const REGISTRY_CONSOLE_CLASS_NAME =
  "management-page-console automation-console registry-console tw:overflow-hidden";
const REGISTRY_CATEGORY_TABS_CLASS_NAME =
  "registry-category-tabs tw:grid tw:grid-cols-4 tw:gap-1.5 tw:rounded-control tw:border tw:p-1 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_70%,var(--bg-elev-2))] tw:max-[860px]:grid-cols-2";
const REGISTRY_CATEGORY_TAB_CLASS_NAME =
  "registry-category-tab tw:flex tw:min-w-0 tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-[var(--radius-sm)] tw:border tw:border-transparent tw:bg-transparent tw:px-2 tw:py-[7px] tw:text-xs tw:leading-[1.25] tw:text-ink-muted tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_52%,var(--line-soft))] tw:hover:bg-bg-base tw:hover:text-ink-1 tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_52%,var(--line-soft))] tw:[&.is-active]:bg-bg-base tw:[&.is-active]:text-ink-1 tw:[&.is-active>strong]:bg-[color-mix(in_srgb,var(--accent-electric)_14%,var(--bg-input))] tw:[&.is-active>strong]:text-accent-electric-strong tw:[&>span]:min-w-0 tw:[&>span]:overflow-hidden tw:[&>span]:text-ellipsis tw:[&>span]:whitespace-nowrap tw:[&>strong]:flex-none tw:[&>strong]:rounded-pill tw:[&>strong]:bg-[color-mix(in_srgb,var(--line-soft)_78%,transparent)] tw:[&>strong]:px-1.5 tw:[&>strong]:py-0.5 tw:[&>strong]:text-[10px] tw:[&>strong]:leading-[1.2] tw:[&>strong]:text-ink-muted";
const REGISTRY_ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const REGISTRY_MESSAGE_CLASS_NAME =
  "registry-console-message tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--accent-electric)_28%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-electric)_7%,transparent)]";
const REGISTRY_BODY_CLASS_NAME =
  "automation-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[minmax(280px,0.52fr)_minmax(480px,1.55fr)] tw:gap-4 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const REGISTRY_LIST_CLASS_NAME =
  "automation-console-list tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[260px]";
const REGISTRY_TOOLBAR_CLASS_NAME =
  "automation-console-toolbar registry-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2 tw:max-[860px]:grid-cols-[minmax(0,1fr)_auto_auto]";
const REGISTRY_COUNT_CLASS_NAME =
  "automation-console-count tw:text-xs tw:text-ink-muted";
const REGISTRY_LIST_SCROLL_CLASS_NAME =
  "automation-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto tw:pr-0.5";
const REGISTRY_LIST_ITEMS_CLASS_NAME =
  "automation-list-items tw:flex tw:flex-col tw:gap-1.5";
const REGISTRY_LIST_ITEM_CLASS_NAME =
  "automation-list-item tw:flex tw:w-full tw:flex-col tw:gap-[3px] tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const REGISTRY_LIST_ITEM_HEAD_CLASS_NAME =
  "automation-list-item-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:[&_.ui-tag]:flex-none";
const REGISTRY_LIST_ITEM_TITLE_CLASS_NAME =
  "automation-list-item-title tw:inline-flex tw:min-w-0 tw:flex-1 tw:items-baseline tw:gap-[5px] tw:overflow-hidden tw:whitespace-nowrap tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.35]";
const REGISTRY_LIST_ITEM_OWNER_CLASS_NAME =
  "automation-list-item-owner tw:max-w-[42%] tw:flex-none tw:overflow-hidden tw:text-ellipsis tw:text-xs tw:leading-[1.35] tw:text-ink-muted";
const REGISTRY_LIST_ITEM_META_CLASS_NAME =
  "automation-list-item-meta registry-list-meta tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:overflow-hidden tw:text-[11px] tw:leading-[1.35] tw:text-ink-muted";
const REGISTRY_LIST_META_TEXT_CLASS_NAME =
  "registry-list-meta-text tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap";
const REGISTRY_CAPABILITY_CHIPS_CLASS_NAME =
  "registry-capability-chips tw:inline-flex tw:flex-none tw:items-center tw:gap-1";
const REGISTRY_CAPABILITY_CHIP_CLASS_NAME =
  "registry-capability-chip tw:inline-flex tw:h-5 tw:w-[22px] tw:min-w-[22px] tw:flex-none tw:items-center tw:justify-center tw:rounded-[var(--radius-sm)] tw:p-0 tw:[&_.material-icon-svg]:h-3 tw:[&_.material-icon-svg]:w-3";
const REGISTRY_DETAIL_CLASS_NAME =
  "automation-console-detail registry-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto";
const REGISTRY_DETAIL_HEAD_CLASS_NAME =
  "automation-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px] tw:[&_span]:text-ink-muted";
const REGISTRY_DETAIL_ACTIONS_CLASS_NAME =
  "automation-detail-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const REGISTRY_META_GRID_CLASS_NAME =
  "registry-meta-grid tw:mb-3 tw:grid tw:grid-cols-2 tw:gap-2 tw:text-[11px] tw:text-ink-muted tw:max-[860px]:grid-cols-1 tw:[&>span]:min-w-0 tw:[&>span]:[overflow-wrap:anywhere]";
const REGISTRY_REQUEST_BOX_BASE_CLASS_NAME =
  "automation-request-box tw:mt-3.5 tw:rounded-control tw:border tw:border-line-soft tw:p-3 tw:[&_.field-group:last-child]:mb-0 tw:[&_legend]:px-1.5 tw:[&_legend]:text-[11px] tw:[&_legend]:font-bold tw:[&_legend]:text-ink-muted";
const REGISTRY_REQUEST_BOX_CLASS_NAME =
  `${REGISTRY_REQUEST_BOX_BASE_CLASS_NAME} registry-summary tw:[&_div]:min-h-[18px] tw:[&_div]:[overflow-wrap:anywhere] tw:[&_div]:text-xs tw:[&_div]:text-ink-2`;
const REGISTRY_DIAGNOSTICS_CLASS_NAME =
  `${REGISTRY_REQUEST_BOX_BASE_CLASS_NAME} registry-diagnostics tw:[border-color:color-mix(in_srgb,var(--accent-danger)_28%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_5%,transparent)]`;
const REGISTRY_DIAGNOSTIC_ROW_CLASS_NAME =
  "registry-diagnostic-row tw:grid tw:grid-cols-[auto_auto_minmax(0,1fr)] tw:items-center tw:gap-2 tw:py-[5px] tw:text-xs tw:[&+&]:border-t tw:[&+&]:[border-color:color-mix(in_srgb,var(--line-soft)_72%,transparent)] tw:[&>strong]:text-[11px] tw:[&>strong]:text-accent-danger tw:[&>span:last-child]:min-w-0 tw:[&>span:last-child]:[overflow-wrap:anywhere] tw:[&>span:last-child]:text-ink-2";
const REGISTRY_EDITOR_FIELD_CLASS_NAME =
  "field-group registry-editor-field tw:mt-3.5";
const REGISTRY_YAML_EDITOR_CLASS_NAME =
  "settings-textarea automation-mono-textarea registry-yaml-editor tw:min-h-[420px] tw:resize-y tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80";
const REGISTRY_SAVE_ACTIONS_CLASS_NAME =
  "automation-save-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const REGISTRY_DIRTY_CLASS_NAME =
  "registry-dirty tw:text-xs tw:text-ink-muted";

export function registryItemKey(item: Pick<AdminRegistryListItem, "category" | "file">): string {
  return `${item.category}/${item.file}`;
}

function defaultFileName(category: RegistryEditableCategory, existing: AdminRegistryListItem[]): string {
  const stemByCategory: Record<RegistryEditableCategory, string> = {
    providers: "new-provider",
    models: "new-model",
    "viewport-servers": "new-viewport-server",
  };
  const existingNames = new Set(
    existing.filter((item) => item.category === category).map((item) => item.file),
  );
  const stem = stemByCategory[category];
  let index = 0;
  while (true) {
    const file = index === 0 ? `${stem}.yml` : `${stem}-${index + 1}.yml`;
    if (!existingNames.has(file)) return file;
    index += 1;
  }
}

function templateForCategory(category: RegistryEditableCategory, file: string): string {
  const key = file.replace(/\.ya?ml$/i, "");
  switch (category) {
    case "providers":
      return [
        `key: ${key}`,
        "baseUrl: https://api.example.com",
        "apiKey: ",
        "defaultModel: ",
        "protocols:",
        "  OPENAI:",
        "    endpointPath: /v1/chat/completions",
        "",
      ].join("\n");
    case "models":
      return [
        `key: ${key}`,
        "name: New Model",
        "provider: ",
        "protocol: OPENAI",
        `modelId: ${key}`,
        "isVision: false",
        "isReasoner: false",
        "isFunction: true",
        "maxInputTokens: 128000",
        "maxOutputTokens: 8192",
        "",
      ].join("\n");
    case "viewport-servers":
      return [
        `serverKey: ${key}`,
        "baseUrl: http://localhost:11969",
        'endpointPath: "/mcp"',
        "timeout: 15",
        "",
      ].join("\n");
  }
}

function formatTimestamp(value: number | undefined, locale: string): string {
  return formatEpochMillisLocal(value, locale);
}

function formatSize(value: number | undefined): string {
  if (value === undefined || value === null) return "--";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

export function summaryLine(summary: Record<string, unknown> | undefined): string {
  if (!summary) return "";
  return Object.entries(summary)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}

function statusTone(status: AdminRegistryStatus): "accent" | "danger" | "muted" {
  if (status === "invalid") return "danger";
  if (status === "disabled") return "muted";
  return "accent";
}

function diagnosticText(item: AdminRegistryListDiagnostic | undefined): string {
  if (!item) return "";
  return item.message || item.code;
}

function summaryString(summary: Record<string, unknown> | undefined, key: string): string {
  return stringValue(summary?.[key]);
}

function summaryBool(summary: Record<string, unknown> | undefined, key: string): boolean {
  const value = summary?.[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "yes", "1", "on", "enabled"].includes(value.trim().toLowerCase());
  }
  return false;
}

function modelTypeLabel(rawType: unknown): string {
  const type = stringValue(rawType);
  if (type === "image-generation") return "image";
  return type;
}

/* ---- tool-normalization helpers ---- */

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readToolKind(tool: AdminToolSummary): string {
  return stringValue(tool.kind);
}

export function readToolSourceType(tool: AdminToolSummary): string {
  return stringValue(tool.sourceType);
}

export function readToolSourceCategory(tool: AdminToolSummary): string {
  return stringValue(tool.sourceCategory);
}

export function toolSourceLabel(sourceCategory: string, t: Translate): string {
  switch (sourceCategory.toLowerCase()) {
    case "platform":
      return t("toolSource.platform");
    case "external":
      return t("toolSource.external");
    default:
      return sourceCategory || "--";
  }
}

export function toolListOwnerLabel(item: AdminRegistryListItem, t: Translate): string {
  const sourceCategory = stringValue(item.summary?.sourceCategory);
  if (!sourceCategory) return "";
  return toolSourceLabel(sourceCategory, t);
}

export function listItemOwnerLabel(item: AdminRegistryListItem, isToolsTab: boolean, t: Translate): string {
  if (!isToolsTab) return "";
  return toolListOwnerLabel(item, t);
}

function toolSourceTone(sourceCategory: string): "accent" | "default" | "muted" {
  switch (sourceCategory.toLowerCase()) {
    case "external":
      return "default";
    default:
      return "muted";
  }
}

export function normalizeToolToSummary(tool: AdminToolSummary): AdminRegistryListItem {
  const kind = readToolKind(tool);
  const sourceType = readToolSourceType(tool);
  const sourceCategory = readToolSourceCategory(tool);
  return {
    category: "tools" as AdminRegistryCategory,
    file: tool.key || tool.name || "unknown",
    key: tool.key,
    name: tool.name || tool.label || tool.key,
    status: "ready",
    summary: {
      sourceCategory,
      sourceType,
      kind,
      description: tool.description,
    },
  };
}

export function toolSearchHaystack(tool: AdminToolSummary): string {
  const parts = [
    tool.key,
    tool.name,
    tool.label,
    tool.description,
    tool.sourceType,
    tool.sourceCategory,
    readToolKind(tool),
  ];
  return parts.filter((v) => typeof v === "string" && v.trim() !== "").join(" ").toLowerCase();
}

export function toolListMeta(item: AdminRegistryListItem): string {
  const key = stringValue(item.summary?.key) || item.key || item.file;
  const kind = stringValue(item.summary?.kind);
  const sourceType = stringValue(item.summary?.sourceType);
  const sourceCategory = stringValue(item.summary?.sourceCategory);
  return [
    key,
    sourceType,
    sourceCategory,
    kind,
  ].filter((value) => value.trim() !== "" && value !== "--").join(" · ");
}

export function registryListTitle(item: AdminRegistryListItem): string {
  switch (item.category) {
    case "providers":
    case "viewport-servers":
      return item.key || item.name || item.file;
    case "models":
      return item.name || item.key || item.file;
    default:
      return item.name || item.key || item.file;
  }
}

export function registryListMeta(item: AdminRegistryListItem, t: Translate): string {
  const summary = item.summary;
  switch (item.category) {
    case "providers":
      return summaryString(summary, "baseUrl") || diagnosticText(item.diagnostic) || "--";
    case "models":
      return [
        summaryString(summary, "provider"),
        summaryString(summary, "protocol"),
        modelTypeLabel(summary?.type),
      ].filter(Boolean).join(" · ") || diagnosticText(item.diagnostic) || "--";
    case "viewport-servers":
      return summaryString(summary, "baseUrl") || diagnosticText(item.diagnostic) || "--";
    default:
      return summaryLine(summary) || diagnosticText(item.diagnostic) || "--";
  }
}

export interface RegistryCapabilityChip {
  key: "vision" | "reasoner" | "function";
  icon: MaterialIconName;
  labelKey: string;
}

export function registryCapabilityChips(item: AdminRegistryListItem): RegistryCapabilityChip[] {
  if (item.category !== "models") return [];
  const summary = item.summary;
  const chips: RegistryCapabilityChip[] = [];
  if (summaryBool(summary, "isVision")) {
    chips.push({ key: "vision", icon: "visibility", labelKey: "registryConsole.capability.vision" });
  }
  if (summaryBool(summary, "isReasoner")) {
    chips.push({ key: "reasoner", icon: "psychology", labelKey: "registryConsole.capability.reasoner" });
  }
  if (summaryBool(summary, "isFunction")) {
    chips.push({ key: "function", icon: "code", labelKey: "registryConsole.capability.function" });
  }
  return chips;
}

export function RegistryCapabilityIconTag({
  chip,
  label,
}: {
  chip: RegistryCapabilityChip;
  label: string;
}) {
  return (
    <UiTag
      tone="muted"
      className={REGISTRY_CAPABILITY_CHIP_CLASS_NAME}
      title={label}
      role="img"
      aria-label={label}
    >
      <MaterialIcon name={chip.icon} />
    </UiTag>
  );
}

export function filterRegistryItems(
  items: AdminRegistryListItem[],
  filters: {
    searchText?: string;
    categoryFilter?: AdminRegistryCategory;
    statusFilter?: StatusFilter;
  },
): AdminRegistryListItem[] {
  const needle = (filters.searchText || "").trim().toLowerCase();
  const categoryFilter = filters.categoryFilter;
  const statusFilter = filters.statusFilter || "all";
  return items.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (!needle) return true;
    const haystack = [
      item.category,
      item.file,
      item.key,
      item.name,
      registryListTitle(item),
      registryListMeta(item, (key) => key),
      summaryLine(item.summary),
      diagnosticText(item.diagnostic),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function registryDetailToListItem(detail: AdminRegistrySummary): AdminRegistryListItem {
  const first = detail.diagnostics?.[0];
  return {
    category: detail.category,
    file: detail.file,
    key: detail.key,
    name: detail.name,
    status: detail.status,
    summary: detail.summary,
    diagnostic: first
      ? {
          severity: first.severity,
          code: first.code,
          message: first.message,
        }
      : undefined,
    diagnosticCount: detail.diagnostics?.length || undefined,
    updatedAt: detail.updatedAt,
  };
}

function registryDetailFromSource(
  source: AdminSourceResponse,
  fallback: Partial<AdminRegistryDetailResponse> = {},
): AdminRegistryDetailResponse {
  return {
    category: source.target.category as AdminRegistryCategory,
    file: source.target.file || "",
    key: fallback.key,
    name: fallback.name,
    status: fallback.status || "ready",
    summary: fallback.summary || {},
    diagnostics: fallback.diagnostics,
    source: source.source,
    content: source.content,
    encoding: source.encoding,
    sha256: source.sha256,
    updatedAt: source.updatedAt,
    size: source.size,
  };
}

export const RegistriesPage = () => {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<AdminRegistryListItem[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<AdminRegistryDetailResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState<RegistryConsoleTab>("providers");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newDraft, setNewDraft] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  /* ---- tools-specific state ---- */
  const [toolItems, setToolItems] = useState<AdminToolSummary[]>([]);
  const [selectedTool, setSelectedTool] = useState<AdminToolSummary | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);

  const isToolsTab = activeCategory === "tools";

  /* ---- normalized list for tools tab ---- */
  const normalizedToolSummaries = useMemo(
    () => toolItems.map(normalizeToolToSummary),
    [toolItems],
  );

  const categoryCounts = useMemo(
    () => {
      const counts: Record<RegistryConsoleTab, number> = {
        providers: 0,
        models: 0,
        "viewport-servers": 0,
        tools: 0,
      };
      for (const item of items) {
        const cat = item.category as RegistryConsoleTab;
        if (cat in counts) {
          counts[cat] += 1;
        }
      }
      counts.tools = toolItems.length;
      return counts;
    },
    [items, toolItems],
  );

  const currentCategoryItems = useMemo(() => {
    if (isToolsTab) {
      return normalizedToolSummaries;
    }
    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, isToolsTab, items, normalizedToolSummaries]);

  /* ---- tool-aware item key ---- */
  const getItemKey = useCallback(
    (item: AdminRegistryListItem): string => {
      if ((item.category as string) === "tools") {
        return `tools/${item.file}`;
      }
      return registryItemKey(item);
    },
    [],
  );

  /* ---- tool list search ---- */
  const filteredToolItems = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return normalizedToolSummaries;
    return normalizedToolSummaries.filter((item) => {
      const original = toolItems.find(
        (t) => (t.key || t.name || "unknown") === item.file,
      );
      if (!original) return false;
      return toolSearchHaystack(original).includes(needle);
    });
  }, [normalizedToolSummaries, searchText, toolItems]);

  const filteredItems = useMemo(() => {
    if (isToolsTab) return filteredToolItems;
    return filterRegistryItems(items, {
      searchText,
      categoryFilter: activeCategory as RegistryEditableCategory,
      statusFilter,
    });
  }, [isToolsTab, activeCategory, filteredToolItems, items, searchText, statusFilter]);

  const refreshToolsList = useCallback(async (): Promise<AdminToolSummary[] | null> => {
    setToolsLoading(true);
    setError("");
    try {
      const response = await getAdminTools();
      const data = response.data;
      const list: AdminToolSummary[] = (Array.isArray(data)
        ? data
        : (data as unknown as { items?: AdminToolSummary[] })?.items ?? [])
        .filter((tool) => !isMcpTool(tool));
      setToolItems(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setToolsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(
    async (item: Pick<AdminRegistryListItem, "category" | "file">) => {
      setDetailLoading(true);
      setError("");
      try {
        const response = await getAdminSource({
          type: "registry",
          category: item.category,
          file: item.file,
        });
        const nextDetail = registryDetailFromSource(response.data, item);
        setDetail(nextDetail);
        setDraft(nextDetail.content || "");
        setDirty(false);
        setNewDraft(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const loadRegistries = useCallback(
    async (preferredKey?: string, categoryOverride?: RegistryEditableCategory) => {
      setLoading(true);
      setError("");
      try {
        const response = await getAdminRegistries();
        const nextItems = (response.data.items || []).filter(
          (item) => item.category !== "mcp-servers",
        );
        setItems(nextItems);
        const category = categoryOverride || (activeCategory as RegistryEditableCategory);
        const categoryItems = nextItems.filter((item) => item.category === category);
        const target =
          (preferredKey
            ? categoryItems.find((item) => registryItemKey(item) === preferredKey)
            : null) ||
          categoryItems.find((item) => registryItemKey(item) === selectedKey) ||
          categoryItems[0] ||
          null;
        if (target && !newDraft) {
          setSelectedKey(registryItemKey(target));
          await loadDetail(target);
        } else if (!newDraft) {
          setSelectedKey("");
          setDetail(null);
          setDraft("");
          setDirty(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [activeCategory, loadDetail, newDraft, selectedKey],
  );

  const loadTools = useCallback(async () => {
    const list = await refreshToolsList();
    if (list) {
      if (list.length > 0) {
        const first = list[0];
        const toolKey = `tools/${first.key || first.name || "0"}`;
        setSelectedTool(first);
        setSelectedKey(toolKey);
      } else {
        setSelectedTool(null);
        setSelectedKey("");
      }
    }
  }, [refreshToolsList]);

  useEffect(() => {
    void loadRegistries(undefined, "providers");
  }, []);

  const selectItem = (item: AdminRegistryListItem) => {
    if (dirty && !window.confirm(t("registryConsole.confirm.discard"))) {
      return;
    }
    const key = getItemKey(item);
    setMessage("");

    if ((item.category as string) === "tools") {
      setSelectedKey(key);
      const tool = toolItems.find(
        (t) => (t.key || t.name || "unknown") === item.file,
      ) || null;
      setSelectedTool(tool);
      return;
    }

    setSelectedKey(key);
    void loadDetail(item);
  };

  const switchCategory = (category: RegistryConsoleTab) => {
    if (category === activeCategory) return;
    if (dirty && !window.confirm(t("registryConsole.confirm.discard"))) {
      return;
    }
    setActiveCategory(category);
    setMessage("");
    setNewDraft(false);
    setDirty(false);

    if (category === "tools") {
      setDetail(null);
      setDraft("");
      if (toolItems.length === 0) {
        void loadTools();
      } else {
        const first = toolItems[0];
        const key = `tools/${first.key || first.name || "0"}`;
        setSelectedKey(key);
        setSelectedTool(first);
      }
      return;
    }

    const registryCategory = category as RegistryEditableCategory;
    const target = items.find((item) => item.category === registryCategory);
    if (target) {
      setSelectedKey(registryItemKey(target));
      void loadDetail(target);
      return;
    }
    setSelectedKey("");
    setDetail(null);
    setDraft("");
  };

  const startNew = () => {
    if (isToolsTab) return;
    if (dirty && !window.confirm(t("registryConsole.confirm.discard"))) {
      return;
    }
    const category = activeCategory as RegistryEditableCategory;
    const file = defaultFileName(category, items);
    const content = templateForCategory(category, file);
    setSelectedKey(`${category}/${file}`);
    setDetail({
      category,
      file,
      key: file.replace(/\.ya?ml$/i, ""),
      status: "ready",
      summary: {},
      content,
    });
    setDraft(content);
    setDirty(true);
    setNewDraft(true);
    setMessage(t("registryConsole.message.newDraft"));
    setError("");
  };

  const validateDraft = async () => {
    if (!detail || isToolsTab) return;
    setValidating(true);
    setError("");
    try {
      const response = await validateAdminRegistry({
        category: detail.category,
        file: detail.file,
        content: draft,
      });
      setDetail({
        ...detail,
        status: response.data.status,
        diagnostics: response.data.diagnostics,
        summary: response.data.summary,
        parsed: response.data.parsed,
      });
      setMessage(
        response.data.status === "invalid"
          ? t("registryConsole.message.validationInvalid")
          : t("registryConsole.message.validationReady"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setValidating(false);
    }
  };

  const saveDraft = async () => {
    if (!detail || isToolsTab) return;
    setSaving(true);
    setError("");
    try {
      const response = await updateAdminSource({
        target: {
          type: "registry",
          category: detail.category,
          file: detail.file,
        },
        content: draft,
        baseSha256: detail.sha256,
      });
      const refreshedResponse = await getAdminRegistries();
      const refreshedItems = (refreshedResponse.data.items || []).filter(
        (item) => item.category !== "mcp-servers",
      );
      const refreshed = refreshedItems.find(
        (item) => item.category === detail.category && item.file === detail.file,
      );
      const nextDetail = registryDetailFromSource(response.data, {
        ...detail,
        ...refreshed,
      });
      setDetail(nextDetail);
      setDraft(nextDetail.content || draft);
      setDirty(false);
      setNewDraft(false);
      setSelectedKey(registryItemKey(nextDetail));
      setItems(refreshedItems);
      setMessage(t("registryConsole.message.savedWaiting"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const refreshCurrent = () => {
    if (isToolsTab) {
      void loadTools();
      return;
    }
    if (detail && !newDraft) {
      void loadDetail(detail);
    }
  };

  const statusMenu: MenuProps = useMemo(() => ({
    onClick: (info) => setStatusFilter(info.key as StatusFilter),
    selectedKeys: [statusFilter],
    items: STATUS_FILTERS.map((status) => ({
      key: status,
      label: translateWithFallback(t, `registryConsole.filter.status.${status}`, status),
    })),
  }), [t, statusFilter]);
  const selectedToolKind = selectedTool ? readToolKind(selectedTool) : "";
  const selectedToolSourceType = selectedTool ? readToolSourceType(selectedTool) : "";
  const selectedToolSourceCategory = selectedTool ? readToolSourceCategory(selectedTool) : "";
  const selectedToolSourceLabel = toolSourceLabel(selectedToolSourceCategory, t);

  return (
    <main className="automations-page registries-page">
      <div className={REGISTRY_CONSOLE_CLASS_NAME}>
        <div className={REGISTRY_CATEGORY_TABS_CLASS_NAME} role="tablist" aria-label={t("registryConsole.section.categories")}>
          {CATEGORIES.map((category) => (
            <button
              type="button"
              key={category}
              role="tab"
              aria-selected={category === activeCategory}
              className={`${REGISTRY_CATEGORY_TAB_CLASS_NAME} ${category === activeCategory ? "is-active" : ""}`}
              onClick={() => switchCategory(category)}
            >
              <span>{translateWithFallback(t, `registryConsole.category.${category}`, category)}</span>
              <strong>{categoryCounts[category]}</strong>
            </button>
          ))}
        </div>

        {error && (
          <div className={REGISTRY_ERROR_CLASS_NAME}>
            <span>{error}</span>
            <UiButton
              size="sm"
              variant="ghost"
              onClick={() => {
                if (isToolsTab) {
                  void loadTools();
                } else {
                  void loadRegistries(selectedKey, activeCategory as RegistryEditableCategory);
                }
              }}
            >
              {t("registryConsole.action.retry")}
            </UiButton>
          </div>
        )}

        {message && !error && <div className={REGISTRY_MESSAGE_CLASS_NAME}>{message}</div>}

        <div className={REGISTRY_BODY_CLASS_NAME}>
          <div className={REGISTRY_LIST_CLASS_NAME}>
            <div className={REGISTRY_TOOLBAR_CLASS_NAME}>
              <SearchFilterBar
                searchText={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder={
                  isToolsTab
                    ? t("registryConsole.searchToolsPlaceholder")
                    : t("registryConsole.searchPlaceholder")
                }
                filters={
                  isToolsTab
                    ? []
                    : [
                        {
                          key: "status",
                          label: t("registryConsole.filter.status.all"),
                          icon: "filter_list",
                          active: statusFilter !== "all",
                          open: statusDropdownOpen,
                          onOpenChange: setStatusDropdownOpen,
                          menu: statusMenu,
                        },
                      ]
                }
              />
              <UiButton
                size="sm"
                variant="ghost"
                iconOnly
                onClick={() => {
                  if (isToolsTab) {
                    void loadTools();
                  } else {
                    void loadRegistries(selectedKey, activeCategory as RegistryEditableCategory);
                  }
                }}
                disabled={loading || saving || toolsLoading}
                aria-label={t("registryConsole.action.refresh")}
              >
                <MaterialIcon name="refresh" />
              </UiButton>
              {!isToolsTab && (
                <UiButton size="sm" variant="primary" iconOnly onClick={startNew} aria-label={t("registryConsole.action.new")}>
                  <MaterialIcon name="add" />
                </UiButton>
              )}
            </div>

            <div className={REGISTRY_COUNT_CLASS_NAME}>
              {isToolsTab
                ? t("registryConsole.list.count.tools", { count: currentCategoryItems.length })
                : t("registryConsole.list.count", { count: currentCategoryItems.length })}
            </div>

            <div className={REGISTRY_LIST_SCROLL_CLASS_NAME}>
              <Spin spinning={isToolsTab ? toolsLoading : loading}>
                {filteredItems.length === 0 ? (
                  <div className="command-empty-state">
                    {isToolsTab ? t("registryConsole.tools.empty") : t("registryConsole.empty")}
                    {!isToolsTab && (
                      <UiButton size="sm" variant="primary" onClick={startNew}>
                        {t("registryConsole.action.create")}
                      </UiButton>
                    )}
                  </div>
                ) : (
                  <div className={REGISTRY_LIST_ITEMS_CLASS_NAME}>
                    {filteredItems.map((item) => {
                      const itemKey = getItemKey(item);
                      const title = registryListTitle(item);
                      const meta = isToolsTab ? toolListMeta(item) : registryListMeta(item, t);
                      const ownerLabel = listItemOwnerLabel(item, isToolsTab, t);
                      const capabilityChips = isToolsTab ? [] : registryCapabilityChips(item);
                      const capabilityTitle = capabilityChips.map((chip) => t(chip.labelKey)).join(", ");
                      return (
                        <button
                          type="button"
                          key={itemKey}
                          className={`${REGISTRY_LIST_ITEM_CLASS_NAME} ${itemKey === selectedKey ? "is-active" : ""}`}
                          onClick={() => selectItem(item)}
                        >
                          <span className={REGISTRY_LIST_ITEM_HEAD_CLASS_NAME}>
                            <span className={REGISTRY_LIST_ITEM_TITLE_CLASS_NAME} title={`${item.category} ${item.file}`}>
                              {ownerLabel && (
                                <span className={REGISTRY_LIST_ITEM_OWNER_CLASS_NAME}>
                                  [{ownerLabel}]
                                </span>
                              )}
                              <strong>{title}</strong>
                            </span>
                            <UiTag tone={statusTone(item.status)}>
                              {translateWithFallback(t, `registryConsole.status.${item.status}`, item.status)}
                            </UiTag>
                          </span>
                          <span
                            className={REGISTRY_LIST_ITEM_META_CLASS_NAME}
                            title={[meta, capabilityTitle].filter(Boolean).join(" · ")}
                          >
                            <span className={REGISTRY_LIST_META_TEXT_CLASS_NAME}>{meta}</span>
                            {capabilityChips.length > 0 && (
                              <span className={REGISTRY_CAPABILITY_CHIPS_CLASS_NAME} aria-label={capabilityTitle}>
                                {capabilityChips.map((chip) => (
                                  <RegistryCapabilityIconTag
                                    key={chip.key}
                                    chip={chip}
                                    label={t(chip.labelKey)}
                                  />
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Spin>
            </div>
          </div>

          {/* ---- detail panel ---- */}
          <div className={REGISTRY_DETAIL_CLASS_NAME}>
            <Spin spinning={detailLoading}>
              {isToolsTab ? (
                /* ---- tools detail (read-only) ---- */
                !selectedTool ? (
                  <div className="command-empty-state">{t("registryConsole.tools.detail.empty")}</div>
                ) : (
                  <>
                    <div className={REGISTRY_DETAIL_HEAD_CLASS_NAME}>
                      <div>
                        <strong>{selectedTool.name || selectedTool.label || selectedTool.key || "--"}</strong>
                        <span>{selectedTool.key || ""}</span>
                      </div>
                      <div className={REGISTRY_DETAIL_ACTIONS_CLASS_NAME}>
                        <UiTag tone={toolSourceTone(selectedToolSourceCategory)}>
                          {selectedToolSourceLabel}
                        </UiTag>
                        <UiButton size="sm" variant="ghost" onClick={refreshCurrent}>
                          <MaterialIcon name="refresh" />
                          <span>{t("registryConsole.action.refresh")}</span>
                        </UiButton>
                      </div>
                    </div>

                    <div className={REGISTRY_META_GRID_CLASS_NAME}>
                      <span>{t("registryConsole.tools.field.name")}: {selectedTool.name || "--"}</span>
                      <span>{t("registryConsole.tools.field.key")}: {selectedTool.key || "--"}</span>
                      <span>{t("registryConsole.tools.field.kind")}: {selectedToolKind || "--"}</span>
                      <span>{t("registryConsole.tools.field.sourceType")}: {selectedToolSourceType || "--"}</span>
                      <span>{t("registryConsole.tools.field.sourceCategory")}: {selectedToolSourceLabel}</span>
                    </div>

                    {selectedTool.description && (
                      <fieldset className={REGISTRY_REQUEST_BOX_CLASS_NAME}>
                        <legend>{t("registryConsole.tools.field.description")}</legend>
                        <div>{selectedTool.description}</div>
                      </fieldset>
                    )}
                  </>
                )
              ) : (
                /* ---- registry detail (existing YAML editor) ---- */
                !detail ? (
                  <div className="command-empty-state">{t("registryConsole.detail.empty")}</div>
                ) : (
                  <>
                    <div className={REGISTRY_DETAIL_HEAD_CLASS_NAME}>
                      <div>
                        <strong>
                          {newDraft
                            ? t("registryConsole.detail.titleCreate")
                            : detail.name || detail.key || detail.file}
                        </strong>
                        <span>{detail.source?.path || `${detail.category}/${detail.file}`}</span>
                      </div>
                      <div className={REGISTRY_DETAIL_ACTIONS_CLASS_NAME}>
                        <UiTag tone={statusTone(detail.status)}>
                          {translateWithFallback(t, `registryConsole.status.${detail.status}`, detail.status)}
                        </UiTag>
                        <UiButton size="sm" variant="ghost" onClick={refreshCurrent} disabled={newDraft || detailLoading}>
                          <MaterialIcon name="refresh" />
                          <span>{t("registryConsole.action.refreshFile")}</span>
                        </UiButton>
                      </div>
                    </div>

                    <div className={REGISTRY_META_GRID_CLASS_NAME}>
                      <span>{t("registryConsole.field.category")}: {translateWithFallback(t, `registryConsole.category.${detail.category}`, detail.category)}</span>
                      <span>{t("registryConsole.field.file")}: {detail.file}</span>
                      <span>{t("registryConsole.field.updatedAt")}: {formatTimestamp(detail.updatedAt, locale)}</span>
                      <span>{t("registryConsole.field.size")}: {formatSize(detail.size)}</span>
                    </div>

                    {detail.diagnostics && detail.diagnostics.length > 0 && (
                      <fieldset className={REGISTRY_DIAGNOSTICS_CLASS_NAME}>
                        <legend>{t("registryConsole.section.diagnostics")}</legend>
                        {detail.diagnostics.map((item, index) => (
                          <div className={REGISTRY_DIAGNOSTIC_ROW_CLASS_NAME} key={`${item.code}-${index}`}>
                            <UiTag tone={item.severity === "error" ? "danger" : "muted"}>{item.severity}</UiTag>
                            <strong>{item.code}</strong>
                            <span>{item.message}</span>
                          </div>
                        ))}
                      </fieldset>
                    )}

                    <fieldset className={REGISTRY_REQUEST_BOX_CLASS_NAME}>
                      <legend>{t("registryConsole.section.summary")}</legend>
                      <div>{summaryLine(detail.summary) || "--"}</div>
                    </fieldset>

                    <div className={REGISTRY_EDITOR_FIELD_CLASS_NAME}>
                      <label htmlFor="registry-yaml-editor">{t("registryConsole.editor.label")}</label>
                      <Input.TextArea
                        id="registry-yaml-editor"
                        className={REGISTRY_YAML_EDITOR_CLASS_NAME}
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.target.value);
                          setDirty(true);
                          setMessage("");
                        }}
                      />
                    </div>

                    <div className={REGISTRY_SAVE_ACTIONS_CLASS_NAME}>
                      <UiButton size="sm" variant="ghost" onClick={validateDraft} disabled={validating || saving}>
                        <MaterialIcon name="rule" />
                        <span>{t("registryConsole.action.validate")}</span>
                      </UiButton>
                      <UiButton size="sm" variant="primary" onClick={saveDraft} disabled={saving || !dirty}>
                        <MaterialIcon name="save" />
                        <span>{t("registryConsole.action.save")}</span>
                      </UiButton>
                      {dirty && <span className={REGISTRY_DIRTY_CLASS_NAME}>{t("registryConsole.message.unsaved")}</span>}
                    </div>
                  </>
                )
              )}
            </Spin>
          </div>
        </div>
      </div>
    </main>
  );
};

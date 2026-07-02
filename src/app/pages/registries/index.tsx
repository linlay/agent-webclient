import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Spin } from "antd";
import type { MenuProps } from "antd";
import {
  getAdminRegistries,
  getAdminRegistryDetail,
  saveAdminRegistryDetail,
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
  AdminToolSummary,
  RegistryConsoleTab,
} from "@/shared/data";
import { useI18n, type I18nContextValue } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { formatEpochMillisLocal } from "@/shared/utils/platformTime";

type StatusFilter = "all" | AdminRegistryStatus;
type Translate = I18nContextValue["t"];

const REGISTRY_CATEGORIES: AdminRegistryCategory[] = [
  "providers",
  "models",
  "mcp-servers",
  "viewport-servers",
];

const CATEGORIES: RegistryConsoleTab[] = [
  ...REGISTRY_CATEGORIES,
  "tools",
];

const STATUS_FILTERS: StatusFilter[] = ["all", "ready", "invalid", "disabled"];

export function registryItemKey(item: Pick<AdminRegistryListItem, "category" | "file">): string {
  return `${item.category}/${item.file}`;
}

function defaultFileName(category: AdminRegistryCategory, existing: AdminRegistryListItem[]): string {
  const stemByCategory: Record<AdminRegistryCategory, string> = {
    providers: "new-provider",
    models: "new-model",
    "mcp-servers": "new-mcp-server",
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

function templateForCategory(category: AdminRegistryCategory, file: string): string {
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
    case "mcp-servers":
      return [
        `serverKey: ${key}`,
        "baseUrl: http://localhost:11969",
        'endpointPath: "/mcp"',
        "enabled: true",
        "toolPrefix: ",
        "read-timeout: 15",
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

function summaryNumber(summary: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = summary?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
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
  return stringValue(tool.meta?.kind);
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
    case "mcp":
      return t("toolSource.mcp");
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
    case "mcp":
      return "accent";
    case "external":
      return "default";
    default:
      return "muted";
  }
}

export function normalizeToolToSummary(tool: AdminToolSummary): AdminRegistryListItem {
  const kind = readToolKind(tool);
  const sourceCategory = readToolSourceCategory(tool);
  return {
    category: "tools" as AdminRegistryCategory,
    file: tool.key || tool.name || "unknown",
    key: tool.key,
    name: tool.name || tool.label || tool.key,
    status: "ready",
    summary: {
      sourceCategory,
      kind,
      description: tool.description,
      tags: tool.tags,
    },
  };
}

export function toolSearchHaystack(tool: AdminToolSummary): string {
  const parts = [
    tool.key,
    tool.name,
    tool.label,
    tool.description,
    tool.sourceCategory,
    readToolKind(tool),
    ...(Array.isArray(tool.tags) ? tool.tags : []),
  ];
  return parts.filter((v) => typeof v === "string" && v.trim() !== "").join(" ").toLowerCase();
}

export function toolListMeta(item: AdminRegistryListItem): string {
  const kind = stringValue(item.summary?.kind);
  return [
    item.file,
    kind,
  ].filter((value) => value.trim() !== "" && value !== "--").join(" · ");
}

export function registryListTitle(item: AdminRegistryListItem): string {
  switch (item.category) {
    case "providers":
    case "mcp-servers":
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
    case "mcp-servers": {
      const toolCount = summaryNumber(summary, "toolCount");
      return [
        summaryString(summary, "baseUrl"),
        toolCount === undefined ? "" : t("registryConsole.meta.toolsCount", { count: toolCount }),
      ].filter(Boolean).join(" · ") || diagnosticText(item.diagnostic) || "--";
    }
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
      registryListMeta(item, (key, params) => {
        if (key === "registryConsole.meta.toolsCount") {
          const count = String(params?.count ?? "");
          return `tools ${count} 工具 ${count} 个`;
        }
        return key;
      }),
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
        "mcp-servers": 0,
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
      categoryFilter: activeCategory as AdminRegistryCategory,
      statusFilter,
    });
  }, [isToolsTab, activeCategory, filteredToolItems, items, searchText, statusFilter]);

  const loadDetail = useCallback(
    async (item: Pick<AdminRegistryListItem, "category" | "file">) => {
      setDetailLoading(true);
      setError("");
      try {
        const response = await getAdminRegistryDetail(item.category, item.file);
        setDetail(response.data);
        setDraft(response.data.content || "");
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
    async (preferredKey?: string, categoryOverride?: AdminRegistryCategory) => {
      setLoading(true);
      setError("");
      try {
        const response = await getAdminRegistries();
        const nextItems = response.data.items || [];
        setItems(nextItems);
        const category = categoryOverride || (activeCategory as AdminRegistryCategory);
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
    setToolsLoading(true);
    setError("");
    try {
      const response = await getAdminTools();
      const data = response.data;
      const list: AdminToolSummary[] = Array.isArray(data)
        ? data
        : (data as unknown as { items?: AdminToolSummary[] })?.items ?? [];
      setToolItems(list);
      if (list.length > 0) {
        const first = list[0];
        const toolKey = `tools/${first.key || first.name || "0"}`;
        setSelectedTool(first);
        setSelectedKey(toolKey);
      } else {
        setSelectedTool(null);
        setSelectedKey("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToolsLoading(false);
    }
  }, []);

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

    const registryCategory = category as AdminRegistryCategory;
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
    const category = activeCategory as AdminRegistryCategory;
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
      const response = await saveAdminRegistryDetail({
        category: detail.category,
        file: detail.file,
        content: draft,
      });
      setDetail(response.data);
      setDraft(response.data.content || draft);
      setDirty(false);
      setNewDraft(false);
      setSelectedKey(registryItemKey(response.data));
      setItems((current) => {
        const listItem = registryDetailToListItem(response.data);
        const key = registryItemKey(listItem);
        const without = current.filter((item) => registryItemKey(item) !== key);
        return [...without, listItem].sort((a, b) =>
          a.category === b.category
            ? a.file.localeCompare(b.file)
            : a.category.localeCompare(b.category),
        );
      });
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
      label: t(`registryConsole.filter.status.${status}`),
    })),
  }), [t, statusFilter]);
  const selectedToolKind = selectedTool ? readToolKind(selectedTool) : "";
  const selectedToolSourceCategory = selectedTool ? readToolSourceCategory(selectedTool) : "";
  const selectedToolSourceLabel = toolSourceLabel(selectedToolSourceCategory, t);

  return (
    <main className="automations-page registries-page">
      <div className="command-modal-section automation-console registry-console">
        <div className="registry-category-tabs" role="tablist" aria-label={t("registryConsole.section.categories")}>
          {CATEGORIES.map((category) => (
            <button
              type="button"
              key={category}
              role="tab"
              aria-selected={category === activeCategory}
              className={`registry-category-tab ${category === activeCategory ? "is-active" : ""}`}
              onClick={() => switchCategory(category)}
            >
              <span>{t(`registryConsole.category.${category}`)}</span>
              <strong>{categoryCounts[category]}</strong>
            </button>
          ))}
        </div>

        {error && (
          <div className="automation-console-error">
            <span>{error}</span>
            <UiButton
              size="sm"
              variant="ghost"
              onClick={() => {
                if (isToolsTab) {
                  void loadTools();
                } else {
                  void loadRegistries(selectedKey, activeCategory as AdminRegistryCategory);
                }
              }}
            >
              {t("registryConsole.action.retry")}
            </UiButton>
          </div>
        )}

        {message && !error && <div className="registry-console-message">{message}</div>}

        <div className="automation-console-body">
          <div className="automation-console-list">
            <div className="automation-console-toolbar registry-console-toolbar">
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
                    void loadRegistries(selectedKey, activeCategory as AdminRegistryCategory);
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

            <div className="automation-console-count">
              {isToolsTab
                ? t("registryConsole.list.count.tools", { count: currentCategoryItems.length })
                : t("registryConsole.list.count", { count: currentCategoryItems.length })}
            </div>

            <div className="automation-console-list-scroll">
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
                  <div className="automation-list-items">
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
                          className={`automation-list-item ${itemKey === selectedKey ? "is-active" : ""}`}
                          onClick={() => selectItem(item)}
                        >
                          <span className="automation-list-item-head">
                            <span className="automation-list-item-title" title={`${item.category} ${item.file}`}>
                              {ownerLabel && (
                                <span className="automation-list-item-owner">
                                  [{ownerLabel}]
                                </span>
                              )}
                              <strong>{title}</strong>
                            </span>
                            <UiTag tone={statusTone(item.status)}>
                              {t(`registryConsole.status.${item.status}`)}
                            </UiTag>
                          </span>
                          <span
                            className="automation-list-item-meta registry-list-meta"
                            title={[meta, capabilityTitle].filter(Boolean).join(" · ")}
                          >
                            <span className="registry-list-meta-text">{meta}</span>
                            {capabilityChips.length > 0 && (
                              <span className="registry-capability-chips" aria-label={capabilityTitle}>
                                {capabilityChips.map((chip) => (
                                  <UiTag
                                    key={chip.key}
                                    tone="muted"
                                    className="registry-capability-chip"
                                    title={t(chip.labelKey)}
                                  >
                                    <MaterialIcon name={chip.icon} />
                                    <span>{t(chip.labelKey)}</span>
                                  </UiTag>
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
          <div className="automation-console-detail registry-console-detail">
            <Spin spinning={detailLoading}>
              {isToolsTab ? (
                /* ---- tools detail (read-only) ---- */
                !selectedTool ? (
                  <div className="command-empty-state">{t("registryConsole.tools.detail.empty")}</div>
                ) : (
                  <>
                    <div className="automation-detail-head">
                      <div>
                        <strong>{selectedTool.name || selectedTool.label || selectedTool.key || "--"}</strong>
                        <span>{selectedTool.key || ""}</span>
                      </div>
                      <div className="automation-detail-actions">
                        <UiTag tone={toolSourceTone(selectedToolSourceCategory)}>
                          {selectedToolSourceLabel}
                        </UiTag>
                        {selectedTool.status && (
                          <UiTag tone={selectedTool.status === "invalid" ? "danger" : "accent"}>
                            {selectedTool.status}
                          </UiTag>
                        )}
                        <UiButton size="sm" variant="ghost" onClick={refreshCurrent}>
                          <MaterialIcon name="refresh" />
                          <span>{t("registryConsole.action.refresh")}</span>
                        </UiButton>
                      </div>
                    </div>

                    <div className="registry-meta-grid">
                      <span>{t("registryConsole.tools.field.key")}: {selectedTool.key || "--"}</span>
                      {selectedToolKind && (
                        <span>{t("registryConsole.tools.field.kind")}: {selectedToolKind}</span>
                      )}
                      <span>{t("registryConsole.tools.field.source")}: {selectedToolSourceLabel}</span>
                    </div>

                    {selectedTool.description && (
                      <fieldset className="automation-request-box registry-summary">
                        <legend>{t("registryConsole.tools.field.description")}</legend>
                        <div>{selectedTool.description}</div>
                      </fieldset>
                    )}

                    {Array.isArray(selectedTool.tags) && selectedTool.tags.length > 0 && (
                      <fieldset className="automation-request-box registry-summary">
                        <legend>{t("registryConsole.tools.field.tags")}</legend>
                        <div className="registry-tool-tags">
                          {selectedTool.tags.map((tag, index) => (
                            <UiTag key={`${tag}-${index}`} tone="muted">{tag}</UiTag>
                          ))}
                        </div>
                      </fieldset>
                    )}

                    <fieldset className="automation-request-box registry-summary">
                      <legend>{t("registryConsole.tools.section.rawJson")}</legend>
                      <pre className="registry-tool-json">
                        {JSON.stringify(selectedTool, null, 2)}
                      </pre>
                    </fieldset>
                  </>
                )
              ) : (
                /* ---- registry detail (existing YAML editor) ---- */
                !detail ? (
                  <div className="command-empty-state">{t("registryConsole.detail.empty")}</div>
                ) : (
                  <>
                    <div className="automation-detail-head">
                      <div>
                        <strong>
                          {newDraft
                            ? t("registryConsole.detail.titleCreate")
                            : detail.name || detail.key || detail.file}
                        </strong>
                        <span>{detail.source?.path || `${detail.category}/${detail.file}`}</span>
                      </div>
                      <div className="automation-detail-actions">
                        <UiTag tone={statusTone(detail.status)}>
                          {t(`registryConsole.status.${detail.status}`)}
                        </UiTag>
                        <UiButton size="sm" variant="ghost" onClick={refreshCurrent} disabled={newDraft || detailLoading}>
                          <MaterialIcon name="refresh" />
                          <span>{t("registryConsole.action.refreshFile")}</span>
                        </UiButton>
                      </div>
                    </div>

                    <div className="registry-meta-grid">
                      <span>{t("registryConsole.field.category")}: {t(`registryConsole.category.${detail.category}`)}</span>
                      <span>{t("registryConsole.field.file")}: {detail.file}</span>
                      <span>{t("registryConsole.field.updatedAt")}: {formatTimestamp(detail.updatedAt, locale)}</span>
                      <span>{t("registryConsole.field.size")}: {formatSize(detail.size)}</span>
                    </div>

                    {detail.diagnostics && detail.diagnostics.length > 0 && (
                      <fieldset className="automation-request-box registry-diagnostics">
                        <legend>{t("registryConsole.section.diagnostics")}</legend>
                        {detail.diagnostics.map((item, index) => (
                          <div className="registry-diagnostic-row" key={`${item.code}-${index}`}>
                            <UiTag tone={item.severity === "error" ? "danger" : "muted"}>{item.severity}</UiTag>
                            <strong>{item.code}</strong>
                            <span>{item.message}</span>
                          </div>
                        ))}
                      </fieldset>
                    )}

                    <fieldset className="automation-request-box registry-summary">
                      <legend>{t("registryConsole.section.summary")}</legend>
                      <div>{summaryLine(detail.summary) || "--"}</div>
                    </fieldset>

                    <div className="field-group registry-editor-field">
                      <label htmlFor="registry-yaml-editor">{t("registryConsole.editor.label")}</label>
                      <Input.TextArea
                        id="registry-yaml-editor"
                        className="settings-textarea automation-mono-textarea registry-yaml-editor"
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.target.value);
                          setDirty(true);
                          setMessage("");
                        }}
                      />
                    </div>

                    <div className="automation-save-actions">
                      <UiButton size="sm" variant="ghost" onClick={validateDraft} disabled={validating || saving}>
                        <MaterialIcon name="rule" />
                        <span>{t("registryConsole.action.validate")}</span>
                      </UiButton>
                      <UiButton size="sm" variant="primary" onClick={saveDraft} disabled={saving || !dirty}>
                        <MaterialIcon name="save" />
                        <span>{t("registryConsole.action.save")}</span>
                      </UiButton>
                      {dirty && <span className="registry-dirty">{t("registryConsole.message.unsaved")}</span>}
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

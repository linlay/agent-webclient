import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Spin } from "antd";
import type { MenuProps } from "antd";
import {
  getAdminRegistries,
  getAdminRegistryDetail,
  saveAdminRegistryDetail,
  validateAdminRegistry,
} from "@/shared/api/apiClient";
import type {
  AdminRegistryCategory,
  AdminRegistryDetailResponse,
  AdminRegistryDiagnostic,
  AdminRegistryStatus,
  AdminRegistrySummary,
} from "@/shared/api/apiClient";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";

type StatusFilter = "all" | AdminRegistryStatus;

const CATEGORIES: AdminRegistryCategory[] = [
  "providers",
  "models",
  "mcp-servers",
  "viewport-servers",
];

const STATUS_FILTERS: StatusFilter[] = ["all", "ready", "invalid", "disabled"];

export function registryItemKey(item: Pick<AdminRegistrySummary, "category" | "file">): string {
  return `${item.category}/${item.file}`;
}

function defaultFileName(category: AdminRegistryCategory, existing: AdminRegistrySummary[]): string {
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
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(locale);
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

function firstDiagnostic(diagnostics: AdminRegistryDiagnostic[] | undefined): string {
  const item = diagnostics?.[0];
  if (!item) return "";
  return item.message || item.code;
}

export function filterRegistryItems(
  items: AdminRegistrySummary[],
  filters: {
    searchText?: string;
    categoryFilter?: AdminRegistryCategory;
    statusFilter?: StatusFilter;
  },
): AdminRegistrySummary[] {
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
      summaryLine(item.summary),
      firstDiagnostic(item.diagnostics),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export const RegistriesPage = () => {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<AdminRegistrySummary[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<AdminRegistryDetailResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState<AdminRegistryCategory>("providers");
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

  const categoryCounts = useMemo(
    () =>
      CATEGORIES.reduce<Record<AdminRegistryCategory, number>>((acc, category) => {
        acc[category] = items.filter((item) => item.category === category).length;
        return acc;
      }, {
        providers: 0,
        models: 0,
        "mcp-servers": 0,
        "viewport-servers": 0,
      }),
    [items],
  );

  const filteredItems = useMemo(() => {
    return filterRegistryItems(items, { searchText, categoryFilter: activeCategory, statusFilter });
  }, [activeCategory, items, searchText, statusFilter]);

  const currentCategoryItems = useMemo(
    () => items.filter((item) => item.category === activeCategory),
    [activeCategory, items],
  );

  const loadDetail = useCallback(
    async (item: Pick<AdminRegistrySummary, "category" | "file">) => {
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
        const category = categoryOverride || activeCategory;
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

  useEffect(() => {
    void loadRegistries(undefined, "providers");
  }, []);

  const selectItem = (item: AdminRegistrySummary) => {
    if (dirty && !window.confirm(t("registryConsole.confirm.discard"))) {
      return;
    }
    const key = registryItemKey(item);
    setSelectedKey(key);
    setMessage("");
    void loadDetail(item);
  };

  const switchCategory = (category: AdminRegistryCategory) => {
    if (category === activeCategory) return;
    if (dirty && !window.confirm(t("registryConsole.confirm.discard"))) {
      return;
    }
    setActiveCategory(category);
    setMessage("");
    setNewDraft(false);
    setDirty(false);
    const target = items.find((item) => item.category === category);
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
    if (dirty && !window.confirm(t("registryConsole.confirm.discard"))) {
      return;
    }
    const category = activeCategory;
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
    if (!detail) return;
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
    if (!detail) return;
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
        const key = registryItemKey(response.data);
        const without = current.filter((item) => registryItemKey(item) !== key);
        return [...without, response.data].sort((a, b) =>
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
            <UiButton size="sm" variant="ghost" onClick={() => loadRegistries(selectedKey, activeCategory)}>
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
                searchPlaceholder={t("registryConsole.searchPlaceholder")}
                filters={[
                  {
                    key: "status",
                    label: t("registryConsole.filter.status.all"),
                    icon: "filter_list",
                    active: statusFilter !== "all",
                    open: statusDropdownOpen,
                    onOpenChange: setStatusDropdownOpen,
                    menu: statusMenu,
                  },
                ]}
              />
              <UiButton
                size="sm"
                variant="ghost"
                iconOnly
                onClick={() => loadRegistries(selectedKey, activeCategory)}
                disabled={loading || saving}
                aria-label={t("registryConsole.action.refresh")}
              >
                <MaterialIcon name="refresh" />
              </UiButton>
              <UiButton size="sm" variant="primary" iconOnly onClick={startNew} aria-label={t("registryConsole.action.new")}>
                <MaterialIcon name="add" />
              </UiButton>
            </div>
            <div className="automation-console-count">
              {t("registryConsole.list.count", { count: currentCategoryItems.length })}
            </div>
            <div className="automation-console-list-scroll">
              <Spin spinning={loading}>
                {filteredItems.length === 0 ? (
                  <div className="command-empty-state">
                    {t("registryConsole.empty")}
                    <UiButton size="sm" variant="primary" onClick={startNew}>
                      {t("registryConsole.action.create")}
                    </UiButton>
                  </div>
                ) : (
                  <div className="automation-list-items">
                    {filteredItems.map((item) => {
                      const itemKey = registryItemKey(item);
                      return (
                        <button
                          type="button"
                          key={itemKey}
                          className={`automation-list-item ${itemKey === selectedKey ? "is-active" : ""}`}
                          onClick={() => selectItem(item)}
                        >
                          <span className="automation-list-item-head">
                            <span className="automation-list-item-title" title={`${item.category} ${item.file}`}>
                              <span className="automation-list-item-owner">
                                [{t(`registryConsole.category.${item.category}`)}]
                              </span>
                              <strong>{item.name || item.key || item.file}</strong>
                            </span>
                            <UiTag tone={statusTone(item.status)}>
                              {t(`registryConsole.status.${item.status}`)}
                            </UiTag>
                          </span>
                          <span className="automation-list-item-meta" title={summaryLine(item.summary)}>
                            {item.file} · {summaryLine(item.summary) || firstDiagnostic(item.diagnostics) || "--"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Spin>
            </div>
          </div>

          <div className="automation-console-detail registry-console-detail">
            <Spin spinning={detailLoading}>
              {!detail ? (
                <div className="command-empty-state">{t("registryConsole.detail.empty")}</div>
              ) : (
                <>
                  <div className="automation-detail-head">
                    <div>
                      <strong>{newDraft ? t("registryConsole.detail.titleCreate") : detail.name || detail.key || detail.file}</strong>
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
              )}
            </Spin>
          </div>
        </div>
      </div>
    </main>
  );
};

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Spin } from "antd";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getAdminRegistries,
  getAdminRegistryDetail,
  getAdminTools,
  saveAdminRegistryDetail,
  validateAdminRegistry,
} from "@/shared/data";
import type {
  AdminRegistryDetailResponse,
  AdminRegistryListItem,
  AdminRegistryStatus,
  AdminToolSummary,
} from "@/shared/data";
import {
  collectUnassignedMcpTools,
  filterMcpServerItems,
  filterMcpToolsBySearch,
  filterMcpToolsForServer,
  findMcpServerByRouteKey,
  isMcpTool,
  mcpServerItemKey,
  mcpServerKey,
  readToolMcpServerKey,
  registryText,
  type UnassignedMcpTool,
} from "@/features/registries/lib/mcpRegistry";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { formatEpochMillisLocal } from "@/shared/utils/platformTime";

const CONSOLE_CLASS_NAME =
  "command-modal-section automation-console registry-console mcp-servers-console tw:overflow-hidden";
const BODY_CLASS_NAME =
  "automation-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[280px_minmax(480px,1.55fr)] tw:gap-4 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const LIST_CLASS_NAME =
  "automation-console-list tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[360px]";
const TOOLBAR_CLASS_NAME =
  "automation-console-toolbar registry-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2";
const LIST_SCROLL_CLASS_NAME =
  "automation-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto tw:pr-0.5";
const LIST_ITEMS_CLASS_NAME = "automation-list-items tw:flex tw:flex-col tw:gap-1.5";
const LIST_ITEM_SHELL_CLASS_NAME =
  "mcp-server-list-item-shell tw:grid tw:w-full tw:min-w-0 tw:grid-cols-[minmax(0,1fr)_auto] tw:items-stretch tw:overflow-hidden tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:text-left tw:text-ink-1 tw:transition-colors tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:focus-visible:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:focus-visible:outline-none tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const LIST_ITEM_CONTENT_CLASS_NAME =
  "tw:flex tw:min-w-0 tw:flex-col tw:gap-[3px] tw:px-2.5 tw:py-2";
const LIST_ITEM_ASIDE_CLASS_NAME =
  "mcp-server-list-item-aside tw:flex tw:min-w-[72px] tw:flex-col tw:items-end tw:justify-between tw:gap-2 tw:py-2 tw:pr-2";
const LIST_ITEM_TOOLS_CLASS_NAME =
  "mcp-server-list-item-tools tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted";
const LIST_ITEM_CLASS_NAME =
  "automation-list-item tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-[3px] tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const LIST_ITEM_HEAD_CLASS_NAME =
  "automation-list-item-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2";
const LIST_ITEM_TITLE_CLASS_NAME =
  "automation-list-item-title tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:font-bold";
const LIST_ITEM_META_CLASS_NAME =
  "registry-list-meta-text tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted";
const UNASSIGNED_CLASS_NAME =
  "mcp-unassigned-entry tw:mt-1 tw:border-t tw:border-line-soft tw:pt-2";
const DETAIL_CLASS_NAME =
  "automation-console-detail registry-console-detail mcp-server-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto";
const DETAIL_HEAD_CLASS_NAME =
  "automation-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px] tw:[&_span]:text-ink-muted";
const DETAIL_SECTION_CLASS_NAME = "mcp-detail-section tw:min-w-0 tw:pb-5";
const DETAIL_SECTION_DIVIDER_CLASS_NAME =
  `${DETAIL_SECTION_CLASS_NAME} tw:border-t tw:border-line-soft tw:pt-4`;
const DETAIL_SECTION_TITLE_CLASS_NAME =
  "tw:mb-3 tw:text-xs tw:font-bold tw:text-ink-1";
const META_GRID_CLASS_NAME =
  "registry-meta-grid tw:mb-3 tw:grid tw:grid-cols-2 tw:gap-2 tw:text-[11px] tw:text-ink-muted tw:max-[860px]:grid-cols-1 tw:[&>span]:min-w-0 tw:[&>span]:[overflow-wrap:anywhere]";
const SECTION_CLASS_NAME =
  "automation-request-box tw:mt-3.5 tw:rounded-control tw:border tw:border-line-soft tw:p-3 tw:[&_legend]:px-1.5 tw:[&_legend]:text-[11px] tw:[&_legend]:font-bold tw:[&_legend]:text-ink-muted";
const TOOL_LIST_CLASS_NAME = "mcp-tool-list tw:flex tw:flex-col tw:gap-2";
const TOOL_ROW_CLASS_NAME =
  "mcp-tool-row tw:rounded-[var(--radius-sm)] tw:border tw:border-line-soft tw:bg-bg-base tw:px-2.5 tw:py-2.5";
const TOOL_HEAD_CLASS_NAME =
  "tw:flex tw:min-w-0 tw:items-start tw:justify-between tw:gap-2.5";
const TOOL_TITLE_CLASS_NAME =
  "tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:[&>strong]:[overflow-wrap:anywhere] tw:[&>strong]:text-xs tw:[&>span]:[overflow-wrap:anywhere] tw:[&>span]:text-[11px] tw:[&>span]:text-ink-muted";
const TOOL_DESCRIPTION_CLASS_NAME =
  "tw:mb-0 tw:mt-1.5 tw:[overflow-wrap:anywhere] tw:text-[11px] tw:leading-[1.45] tw:text-ink-muted";
const EDITOR_CLASS_NAME =
  "settings-textarea automation-mono-textarea registry-yaml-editor tw:min-h-[420px] tw:resize-y tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80";
const MESSAGE_CLASS_NAME =
  "registry-console-message tw:rounded-control tw:border tw:border-line-soft tw:bg-bg-hover tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1";
const ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";

function statusTone(status: AdminRegistryStatus): "accent" | "danger" | "muted" {
  if (status === "invalid") return "danger";
  if (status === "disabled") return "muted";
  return "accent";
}

function summaryNumber(
  summary: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = summary?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function summaryLine(summary: Record<string, unknown> | undefined): string {
  if (!summary) return "";
  return Object.entries(summary)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}

export function mcpServerCardTitle(item: AdminRegistryListItem): string {
  return registryText(item.name) || registryText(item.key) || mcpServerKey(item);
}

export function mcpServerCardSecondaryKey(item: AdminRegistryListItem): string {
  const title = mcpServerCardTitle(item);
  const serverKey = mcpServerKey(item);
  return title === serverKey ? "" : serverKey;
}

export function defaultMcpServerFileName(items: AdminRegistryListItem[]): string {
  const names = new Set(
    items
      .filter((item) => item.category === "mcp-servers")
      .map((item) => item.file),
  );
  let index = 1;
  while (true) {
    const file = index === 1 ? "new-mcp-server.yml" : `new-mcp-server-${index}.yml`;
    if (!names.has(file)) return file;
    index += 1;
  }
}

export function createMcpServerTemplate(file: string): string {
  const key = file.replace(/\.ya?ml$/i, "");
  return [
    `serverKey: ${key}`,
    "baseUrl: http://localhost:11969",
    'endpointPath: "/mcp"',
    "enabled: true",
    "toolPrefix: ",
    "read-timeout: 15",
    "",
  ].join("\n");
}

export function mcpServersRoutePath(serverKey: string, search = ""): string {
  const normalizedKey = serverKey.trim();
  const normalizedSearch = search
    ? search.startsWith("?")
      ? search
      : `?${search}`
    : "";
  return normalizedKey
    ? `/mcp-servers/${encodeURIComponent(normalizedKey)}${normalizedSearch}`
    : `/mcp-servers${normalizedSearch}`;
}

function detailToListItem(detail: AdminRegistryDetailResponse): AdminRegistryListItem {
  const firstDiagnostic = detail.diagnostics?.[0];
  return {
    category: detail.category,
    file: detail.file,
    key: detail.key,
    name: detail.name,
    status: detail.status,
    summary: detail.summary,
    diagnostic: firstDiagnostic
      ? {
          severity: firstDiagnostic.severity,
          code: firstDiagnostic.code,
          message: firstDiagnostic.message,
        }
      : undefined,
    diagnosticCount: detail.diagnostics?.length || undefined,
    updatedAt: detail.updatedAt,
  };
}

export const McpServersPage = () => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ serverKey?: string }>();
  const routeServerKey = String(params.serverKey || "").trim();
  const routeSearch = location.search || "";
  const routeServerKeyRef = useRef(routeServerKey);
  const didLoadRef = useRef(false);

  const [items, setItems] = useState<AdminRegistryListItem[]>([]);
  const [tools, setTools] = useState<AdminToolSummary[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [detail, setDetail] = useState<AdminRegistryDetailResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [toolSearchText, setToolSearchText] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [routeNotFound, setRouteNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newDraft, setNewDraft] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    routeServerKeyRef.current = routeServerKey;
  }, [routeServerKey]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const mcpTools = useMemo(() => tools.filter(isMcpTool), [tools]);
  const filteredItems = useMemo(
    () => filterMcpServerItems(items, searchText),
    [items, searchText],
  );
  const unassignedTools = useMemo(
    () => collectUnassignedMcpTools(mcpTools, items),
    [items, mcpTools],
  );
  const selectedServerKey = detail ? mcpServerKey(detail) : "";
  const selectedTools = useMemo(
    () => filterMcpToolsForServer(mcpTools, selectedServerKey),
    [mcpTools, selectedServerKey],
  );
  const visibleSelectedTools = useMemo(
    () => filterMcpToolsBySearch(selectedTools, toolSearchText),
    [selectedTools, toolSearchText],
  );
  const visibleUnassignedTools = useMemo(() => {
    const filtered = filterMcpToolsBySearch(
      unassignedTools.map((item) => item.tool),
      toolSearchText,
    );
    const visibleKeys = new Set(filtered.map((tool) => tool.key));
    return unassignedTools.filter((item) => visibleKeys.has(item.tool.key));
  }, [toolSearchText, unassignedTools]);

  const loadDetail = useCallback(async (item: AdminRegistryListItem) => {
    setDetailLoading(true);
    setError("");
    try {
      const response = await getAdminRegistryDetail("mcp-servers", item.file);
      setSelectedItemKey(mcpServerItemKey(item));
      setDetail(response.data);
      setDraft(response.data.content || "");
      setDirty(false);
      setNewDraft(false);
      setRouteNotFound(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadPage = useCallback(
    async (
      preferredServerKey = "",
      preserveUnassigned = false,
    ) => {
      setLoading(true);
      setError("");
      try {
        const [registryResponse, toolsResponse] = await Promise.all([
          getAdminRegistries(),
          getAdminTools(),
        ]);
        const nextItems = (registryResponse.data.items || []).filter(
          (item) => item.category === "mcp-servers",
        );
        const nextTools = Array.isArray(toolsResponse.data) ? toolsResponse.data : [];
        setItems(nextItems);
        setTools(nextTools);

        if (preserveUnassigned) {
          setShowUnassigned(true);
          setRouteNotFound(false);
          setSelectedItemKey("");
          setDetail(null);
          setDraft("");
          return;
        }

        const target = preferredServerKey
          ? findMcpServerByRouteKey(nextItems, preferredServerKey)
          : nextItems[0] || null;
        if (preferredServerKey && !target) {
          setSelectedItemKey("");
          setDetail(null);
          setDraft("");
          setRouteNotFound(true);
          setShowUnassigned(false);
          return;
        }
        if (target) {
          setShowUnassigned(false);
          await loadDetail(target);
        } else {
          setSelectedItemKey("");
          setDetail(null);
          setDraft("");
          setRouteNotFound(false);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    },
    [loadDetail],
  );

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadPage(routeServerKeyRef.current);
  }, [loadPage]);

  useEffect(() => {
    if (!didLoadRef.current || loading || newDraft || showUnassigned) return;
    if (!routeServerKey) return;
    const target = findMcpServerByRouteKey(items, routeServerKey);
    if (!target) {
      setRouteNotFound(true);
      setSelectedItemKey("");
      setDetail(null);
      return;
    }
    const targetKey = mcpServerItemKey(target);
    if (targetKey !== selectedItemKey) {
      setToolSearchText("");
      void loadDetail(target);
    }
  }, [items, loadDetail, loading, newDraft, routeServerKey, selectedItemKey, showUnassigned]);

  const confirmDiscard = () =>
    !dirty || window.confirm(t("mcpServers.confirm.discard"));

  const refreshPage = () => {
    if (!confirmDiscard()) return;
    void loadPage(
      selectedServerKey || routeServerKey,
      showUnassigned,
    );
  };

  const selectServer = (item: AdminRegistryListItem) => {
    if (!confirmDiscard()) return;
    const serverKey = mcpServerKey(item);
    setShowUnassigned(false);
    setRouteNotFound(false);
    setToolSearchText("");
    setMessage("");
    navigate(mcpServersRoutePath(serverKey, routeSearch));
    void loadDetail(item);
  };

  const selectUnassigned = () => {
    if (!confirmDiscard()) return;
    setShowUnassigned(true);
    setRouteNotFound(false);
    setDetail(null);
    setSelectedItemKey("");
    setToolSearchText("");
    setDirty(false);
    setNewDraft(false);
    setMessage("");
    navigate(mcpServersRoutePath("", routeSearch));
  };

  const startNew = () => {
    if (!confirmDiscard()) return;
    const file = defaultMcpServerFileName(items);
    const content = createMcpServerTemplate(file);
    setSelectedItemKey(`mcp-servers/${file}`);
    setDetail({
      category: "mcp-servers",
      file,
      key: file.replace(/\.ya?ml$/i, ""),
      status: "ready",
      summary: {},
      content,
    });
    setDraft(content);
    setShowUnassigned(false);
    setRouteNotFound(false);
    setDirty(true);
    setNewDraft(true);
    setError("");
    setMessage(t("mcpServers.message.newDraft"));
    navigate(mcpServersRoutePath("", routeSearch));
  };

  const validateDraft = async () => {
    if (!detail) return;
    setValidating(true);
    setError("");
    try {
      const response = await validateAdminRegistry({
        category: "mcp-servers",
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
          ? t("mcpServers.message.validationInvalid")
          : t("mcpServers.message.validationReady"),
      );
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : String(validationError),
      );
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
        category: "mcp-servers",
        file: detail.file,
        content: draft,
      });
      const nextDetail = response.data;
      const nextItem = detailToListItem(nextDetail);
      const nextRouteKey = mcpServerKey(nextDetail);
      setDetail(nextDetail);
      setDraft(nextDetail.content || draft);
      setDirty(false);
      setNewDraft(false);
      setSelectedItemKey(mcpServerItemKey(nextItem));
      setItems((current) => {
        const key = mcpServerItemKey(nextItem);
        return [...current.filter((item) => mcpServerItemKey(item) !== key), nextItem]
          .sort((a, b) => a.file.localeCompare(b.file));
      });
      setMessage(t("mcpServers.message.saved"));
      navigate(mcpServersRoutePath(nextRouteKey, routeSearch));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const renderTool = (
    tool: AdminToolSummary,
    unassigned?: UnassignedMcpTool,
  ) => (
    <div className={TOOL_ROW_CLASS_NAME} key={tool.key || tool.name}>
      <div className={TOOL_HEAD_CLASS_NAME}>
        <div className={TOOL_TITLE_CLASS_NAME}>
          <strong>{tool.name || tool.label || tool.key || "--"}</strong>
          <span>{tool.key || "--"}</span>
        </div>
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-1.5">
          {tool.kind && <UiTag tone="muted">{tool.kind}</UiTag>}
          {unassigned && (
            <UiTag tone="danger">
              {t(`mcpServers.unassigned.reason.${unassigned.reason}`)}
            </UiTag>
          )}
        </div>
      </div>
      {tool.description && <p className={TOOL_DESCRIPTION_CLASS_NAME}>{tool.description}</p>}
      {unassigned?.reason === "unknown-server-key" && (
        <p className={TOOL_DESCRIPTION_CLASS_NAME}>
          {t("mcpServers.unassigned.serverKey", {
            serverKey: readToolMcpServerKey(tool),
          })}
        </p>
      )}
    </div>
  );

  const expectedToolCount = summaryNumber(detail?.summary, "toolCount");

  return (
    <main className="automations-page mcp-servers-page">
      <div className={CONSOLE_CLASS_NAME}>
        {error && (
          <div className={ERROR_CLASS_NAME}>
            <span>{error}</span>
            <UiButton
              size="sm"
              variant="ghost"
              onClick={refreshPage}
            >
              {t("mcpServers.action.retry")}
            </UiButton>
          </div>
        )}
        {message && !error && <div className={MESSAGE_CLASS_NAME}>{message}</div>}

        <div className={BODY_CLASS_NAME}>
          <section className={LIST_CLASS_NAME} aria-label={t("mcpServers.list.ariaLabel")}>
            <div className={TOOLBAR_CLASS_NAME}>
              <SearchFilterBar
                searchText={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder={t("mcpServers.searchPlaceholder")}
                filters={[]}
              />
              <UiButton
                size="sm"
                variant="ghost"
                iconOnly
                aria-label={t("mcpServers.action.refresh")}
                disabled={loading || saving}
                onClick={refreshPage}
              >
                <MaterialIcon name="refresh" />
              </UiButton>
              <UiButton
                size="sm"
                variant="primary"
                iconOnly
                aria-label={t("mcpServers.action.new")}
                onClick={startNew}
              >
                <MaterialIcon name="add" />
              </UiButton>
            </div>
            <div className="automation-console-count tw:text-xs tw:text-ink-muted">
              {t("mcpServers.list.count", { count: items.length })}
            </div>
            <div className={LIST_SCROLL_CLASS_NAME}>
              <Spin spinning={loading}>
                {filteredItems.length === 0 ? (
                  <div className="command-empty-state">
                    {t("mcpServers.list.empty")}
                    <UiButton size="sm" variant="primary" onClick={startNew}>
                      {t("mcpServers.action.create")}
                    </UiButton>
                  </div>
                ) : (
                  <div className={LIST_ITEMS_CLASS_NAME}>
                    {filteredItems.map((item) => {
                      const itemKey = mcpServerItemKey(item);
                      const serverKey = mcpServerKey(item);
                      const title = mcpServerCardTitle(item);
                      const secondaryServerKey = mcpServerCardSecondaryKey(item);
                      const serverTools = filterMcpToolsForServer(mcpTools, serverKey);
                      const baseUrl = registryText(item.summary?.baseUrl) || "--";
                      const isActive = !showUnassigned && selectedItemKey === itemKey;
                      return (
                        <button
                          type="button"
                          className={`${LIST_ITEM_SHELL_CLASS_NAME} ${isActive ? "is-active" : ""}`}
                          key={itemKey}
                          onClick={() => selectServer(item)}
                        >
                          <span className={LIST_ITEM_CONTENT_CLASS_NAME}>
                            <strong className={LIST_ITEM_TITLE_CLASS_NAME}>
                              {title}
                            </strong>
                            {secondaryServerKey && (
                              <span className={LIST_ITEM_META_CLASS_NAME}>
                                {secondaryServerKey}
                              </span>
                            )}
                            <span className={LIST_ITEM_META_CLASS_NAME}>{baseUrl}</span>
                          </span>
                          <span className={LIST_ITEM_ASIDE_CLASS_NAME}>
                            <UiTag tone={statusTone(item.status)}>
                              {t(`registryConsole.status.${item.status}`)}
                            </UiTag>
                            <span className={LIST_ITEM_TOOLS_CLASS_NAME}>
                              {t("mcpServers.tools.count", { count: serverTools.length })}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Spin>
            </div>
            <div className={UNASSIGNED_CLASS_NAME}>
              <button
                type="button"
                className={`${LIST_ITEM_CLASS_NAME} ${showUnassigned ? "is-active" : ""}`}
                onClick={selectUnassigned}
              >
                <span className={LIST_ITEM_HEAD_CLASS_NAME}>
                  <strong className={LIST_ITEM_TITLE_CLASS_NAME}>
                    {t("mcpServers.unassigned.title")}
                  </strong>
                  <UiTag tone={unassignedTools.length > 0 ? "danger" : "muted"}>
                    {unassignedTools.length}
                  </UiTag>
                </span>
                <span className={LIST_ITEM_META_CLASS_NAME}>
                  {t("mcpServers.unassigned.subtitle")}
                </span>
              </button>
            </div>
          </section>

          <section className={DETAIL_CLASS_NAME} aria-live="polite">
            <Spin spinning={detailLoading}>
              {showUnassigned ? (
                <>
                  <div className={DETAIL_HEAD_CLASS_NAME}>
                    <div>
                      <strong>{t("mcpServers.unassigned.title")}</strong>
                      <span>{t("mcpServers.unassigned.detail")}</span>
                    </div>
                    <UiTag tone={unassignedTools.length > 0 ? "danger" : "muted"}>
                      {unassignedTools.length}
                    </UiTag>
                  </div>
                  <SearchFilterBar
                    searchText={toolSearchText}
                    onSearchChange={setToolSearchText}
                    searchPlaceholder={t("mcpServers.tools.searchPlaceholder")}
                    filters={[]}
                  />
                  <div className="tw:mt-3">
                    {visibleUnassignedTools.length > 0 ? (
                      <div className={TOOL_LIST_CLASS_NAME}>
                        {visibleUnassignedTools.map((item) => renderTool(item.tool, item))}
                      </div>
                    ) : (
                      <div className="command-empty-state">
                        {t("mcpServers.unassigned.empty")}
                      </div>
                    )}
                  </div>
                </>
              ) : routeNotFound ? (
                <div className="command-empty-state">
                  {t("mcpServers.detail.notFound", { serverKey: routeServerKey })}
                </div>
              ) : !detail ? (
                <div className="command-empty-state">{t("mcpServers.detail.empty")}</div>
              ) : (
                <>
                  <div className={DETAIL_HEAD_CLASS_NAME}>
                    <div>
                      <strong>
                        {newDraft
                          ? t("mcpServers.detail.newTitle")
                          : detail.name || detail.key || selectedServerKey}
                      </strong>
                      <span>{selectedServerKey}</span>
                    </div>
                    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                      <UiTag tone={statusTone(detail.status)}>
                        {t(`registryConsole.status.${detail.status}`)}
                      </UiTag>
                      <UiButton
                        size="sm"
                        variant="ghost"
                        disabled={newDraft || detailLoading}
                        onClick={refreshPage}
                      >
                        <MaterialIcon name="refresh" />
                        <span>{t("mcpServers.action.refresh")}</span>
                      </UiButton>
                    </div>
                  </div>
                  <section
                    className={DETAIL_SECTION_CLASS_NAME}
                    aria-labelledby="mcp-server-overview-heading"
                  >
                    <h2
                      id="mcp-server-overview-heading"
                      className={DETAIL_SECTION_TITLE_CLASS_NAME}
                    >
                      {t("mcpServers.section.overview")}
                    </h2>
                    <div className={META_GRID_CLASS_NAME}>
                      <span>{t("mcpServers.field.baseUrl")}: {registryText(detail.summary?.baseUrl) || "--"}</span>
                      <span>{t("mcpServers.field.file")}: {detail.file}</span>
                      <span>{t("mcpServers.field.updatedAt")}: {formatEpochMillisLocal(detail.updatedAt, locale)}</span>
                      <span>
                        {t("mcpServers.field.toolSync")}: {selectedTools.length}
                        {expectedToolCount === undefined ? "" : ` / ${expectedToolCount}`}
                      </span>
                    </div>
                    <fieldset className={SECTION_CLASS_NAME}>
                      <legend>{t("mcpServers.section.diagnostics")}</legend>
                      {detail.diagnostics && detail.diagnostics.length > 0 ? (
                        detail.diagnostics.map((diagnostic, index) => (
                          <div
                            className="tw:grid tw:grid-cols-[auto_auto_minmax(0,1fr)] tw:items-center tw:gap-2 tw:py-1.5 tw:text-xs"
                            key={`${diagnostic.code}-${index}`}
                          >
                            <UiTag tone={diagnostic.severity === "error" ? "danger" : "muted"}>
                              {diagnostic.severity}
                            </UiTag>
                            <strong>{diagnostic.code}</strong>
                            <span>{diagnostic.message}</span>
                          </div>
                        ))
                      ) : (
                        <div className="tw:text-xs tw:text-ink-muted">
                          {t("mcpServers.diagnostics.ready")}
                        </div>
                      )}
                    </fieldset>
                    <fieldset className={SECTION_CLASS_NAME}>
                      <legend>{t("mcpServers.section.summary")}</legend>
                      <div className="tw:text-xs tw:text-ink-2">
                        {summaryLine(detail.summary) || "--"}
                      </div>
                    </fieldset>
                  </section>

                  <section
                    className={DETAIL_SECTION_DIVIDER_CLASS_NAME}
                    aria-labelledby="mcp-server-tools-heading"
                  >
                    <h2
                      id="mcp-server-tools-heading"
                      className={DETAIL_SECTION_TITLE_CLASS_NAME}
                    >
                      {t("mcpServers.section.toolsCount", { count: selectedTools.length })}
                    </h2>
                    <SearchFilterBar
                      searchText={toolSearchText}
                      onSearchChange={setToolSearchText}
                      searchPlaceholder={t("mcpServers.tools.searchPlaceholder")}
                      filters={[]}
                    />
                    <div className="tw:mt-3">
                      {visibleSelectedTools.length > 0 ? (
                        <div className={TOOL_LIST_CLASS_NAME}>
                          {visibleSelectedTools.map((tool) => renderTool(tool))}
                        </div>
                      ) : (
                        <div className="command-empty-state">
                          {expectedToolCount && expectedToolCount > 0
                            ? t("mcpServers.tools.emptyMissingAssignment")
                            : t("mcpServers.tools.empty")}
                        </div>
                      )}
                    </div>
                  </section>

                  <section
                    className={DETAIL_SECTION_DIVIDER_CLASS_NAME}
                    aria-labelledby="mcp-server-config-heading"
                  >
                    <h2
                      id="mcp-server-config-heading"
                      className={DETAIL_SECTION_TITLE_CLASS_NAME}
                    >
                      {t("mcpServers.section.config")}
                    </h2>
                    <div className="field-group registry-editor-field">
                      <label htmlFor="mcp-server-yaml-editor">
                        {t("mcpServers.config.label")}
                      </label>
                      <Input.TextArea
                        id="mcp-server-yaml-editor"
                        className={EDITOR_CLASS_NAME}
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.target.value);
                          setDirty(true);
                          setMessage("");
                        }}
                      />
                    </div>
                    <div className="automation-save-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                      <UiButton
                        size="sm"
                        variant="secondary"
                        loading={validating}
                        disabled={saving}
                        onClick={() => void validateDraft()}
                      >
                        <MaterialIcon name="rule" />
                        <span>{t("mcpServers.action.validate")}</span>
                      </UiButton>
                      <UiButton
                        size="sm"
                        variant="primary"
                        loading={saving}
                        disabled={validating || (!dirty && !newDraft)}
                        onClick={() => void saveDraft()}
                      >
                        <MaterialIcon name="save" />
                        <span>{t("mcpServers.action.save")}</span>
                      </UiButton>
                      {dirty && (
                        <span className="tw:text-xs tw:text-ink-muted">
                          {t("mcpServers.config.dirty")}
                        </span>
                      )}
                    </div>
                  </section>
                </>
              )}
            </Spin>
          </section>
        </div>
      </div>
    </main>
  );
};

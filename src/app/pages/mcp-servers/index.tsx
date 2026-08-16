import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Input, Popconfirm, Select, Spin, Switch } from "antd";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getAdminRegistries,
  getAdminSource,
  getAdminTools,
  deleteAdminSource,
  updateAdminSource,
  validateAdminRegistry,
} from "@/shared/data";
import type {
  AdminRegistryDetailResponse,
  AdminRegistryListItem,
  AdminRegistryStatus,
  AdminSourceResponse,
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
import { createMcpDetailRequestCoordinator } from "@/features/registries/lib/mcpDetailRequestCoordinator";
import {
  buildMcpServerDefinition,
  EMPTY_MCP_SERVER_FORM,
  mcpServerFormFromDefinition,
  resolvedMcpServerUrl,
  stringifyMcpServerYaml,
  type McpServerFormState,
} from "@/features/registries/lib/mcpServerForm";
import { useI18n } from "@/shared/i18n";
import {
  MaterialIcon,
  type MaterialIconName,
} from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { formatEpochMillisLocal } from "@/shared/utils/platformTime";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";

export const MCP_CATALOG_POLL_INTERVAL_MS = 5_000;
const MCP_CATALOG_PUSH_DEBOUNCE_MS = 150;

const CONSOLE_CLASS_NAME =
  "management-page-console automation-console registry-console mcp-servers-console tw:overflow-hidden";
const BODY_CLASS_NAME =
  "automation-console-body tw:grid tw:min-h-0 tw:flex-auto tw:gap-4 tw:overflow-hidden tw:max-[860px]:overflow-auto";
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
  "settings-textarea automation-source-editor registry-yaml-editor tw:min-h-0 tw:flex-1 tw:resize-none tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80 tw:max-[860px]:flex-none tw:max-[860px]:resize-y";
const MESSAGE_CLASS_NAME =
  "registry-console-message tw:rounded-control tw:border tw:border-line-soft tw:bg-bg-hover tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1";
const ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const MCP_SECTION_NAV_CLASS_NAME =
  "automation-section-nav mcp-section-nav tw:sticky tw:top-0 tw:flex tw:items-center";
const MCP_SECTION_NAV_LINKS_CLASS_NAME =
  "automation-section-nav-links tw:flex tw:min-w-0 tw:flex-1 tw:overflow-x-auto";
const MCP_SECTION_NAV_LINK_CLASS_NAME =
  "automation-section-nav-link tw:flex-none tw:whitespace-nowrap";
const MCP_SECTION_NAV_ACTIONS_CLASS_NAME =
  "automation-section-nav-actions tw:ml-auto tw:flex tw:flex-none tw:items-center tw:gap-2";
const MCP_FORM_GRID_CLASS_NAME =
  "automation-form-grid mcp-form-grid tw:grid tw:grid-cols-3 tw:gap-3 tw:max-[860px]:grid-cols-1 tw:[&_.field-group]:mb-0";
const MCP_FORM_FULL_WIDTH_CLASS_NAME =
  "field-group automation-form-full-width tw:col-span-3 tw:max-[860px]:col-span-1";
const MCP_FORM_SECTION_CLASS_NAME = "automation-form-section mcp-form-section";
const MCP_FORM_SECTION_HEADING_CLASS_NAME =
  "automation-form-section-heading tw:flex tw:items-center tw:gap-1.5";
const MCP_SOURCE_WORKSPACE_CLASS_NAME =
  "automation-source-workspace mcp-source-workspace tw:flex tw:min-h-0 tw:flex-1 tw:flex-col";

type McpServerEditorMode = "structured" | "source";

export const MCP_SERVER_FORM_SECTION_IDS = [
  "mcp-server-section-basic",
  "mcp-server-section-connection",
  "mcp-server-section-sync",
  "mcp-server-section-status",
  "mcp-server-section-tools",
] as const;

export type McpServerFormSectionId =
  (typeof MCP_SERVER_FORM_SECTION_IDS)[number];

export function resolveActiveMcpServerFormSection(
  sectionTops: number[],
  activationLine: number,
  atBottom: boolean,
): McpServerFormSectionId {
  if (atBottom) {
    return MCP_SERVER_FORM_SECTION_IDS[MCP_SERVER_FORM_SECTION_IDS.length - 1];
  }
  let activeSection: McpServerFormSectionId = MCP_SERVER_FORM_SECTION_IDS[0];
  MCP_SERVER_FORM_SECTION_IDS.forEach((sectionId, index) => {
    if (sectionTops[index] <= activationLine) activeSection = sectionId;
  });
  return activeSection;
}

interface McpFormSectionProps {
  active?: boolean;
  children: ReactNode;
  icon: MaterialIconName;
  id: McpServerFormSectionId;
  title: string;
}

const McpFormSection = ({
  active = false,
  children,
  icon,
  id,
  title,
}: McpFormSectionProps) => {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className={`${MCP_FORM_SECTION_CLASS_NAME} ${active ? "is-active" : ""}`}
      aria-labelledby={titleId}
    >
      <div className={MCP_FORM_SECTION_HEADING_CLASS_NAME}>
        <MaterialIcon name={icon} />
        <h3 id={titleId}>{title}</h3>
      </div>
      {children}
    </section>
  );
};

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
    .filter(
      ([key, value]) =>
        ![
          "syncStatus",
          "lastSyncAttemptAt",
          "lastSyncSuccessAt",
          "syncDiagnostic",
        ].includes(key) &&
        value !== undefined &&
        value !== null &&
        (Array.isArray(value) || typeof value !== "object") &&
        String(value).trim(),
    )
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}

function mergeMcpValidationSummary(
  current: Record<string, unknown> | undefined,
  validated: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = { ...(validated || {}) };
  for (const key of [
    "toolCount",
    "syncStatus",
    "lastSyncAttemptAt",
    "lastSyncSuccessAt",
    "syncDiagnostic",
  ]) {
    if (current && Object.prototype.hasOwnProperty.call(current, key)) {
      next[key] = current[key];
    }
  }
  return next;
}

export type McpToolSyncStatus =
  | "pending"
  | "syncing"
  | "ready"
  | "unavailable"
  | "disabled";

const MCP_TOOL_SYNC_STATUSES = new Set<McpToolSyncStatus>([
  "pending",
  "syncing",
  "ready",
  "unavailable",
  "disabled",
]);

export function readMcpToolSyncStatus(
  summary: Record<string, unknown> | undefined,
): McpToolSyncStatus {
  const status = registryText(summary?.syncStatus) as McpToolSyncStatus;
  if (MCP_TOOL_SYNC_STATUSES.has(status)) return status;
  return summaryNumber(summary, "toolCount") === undefined ? "pending" : "ready";
}

export function readMcpSyncDiagnostic(
  summary: Record<string, unknown> | undefined,
): { severity: string; code: string; message: string } | null {
  const value = summary?.syncDiagnostic;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const diagnostic = value as Record<string, unknown>;
  const message = registryText(diagnostic.message);
  if (!message) return null;
  return {
    severity: registryText(diagnostic.severity) || "error",
    code: registryText(diagnostic.code) || "mcp_sync_failed",
    message,
  };
}

function syncStatusTone(
  status: McpToolSyncStatus,
): "accent" | "danger" | "muted" {
  if (status === "ready") return "accent";
  if (status === "unavailable") return "danger";
  return "muted";
}

export type McpServerDisplayStatus =
  | { kind: "registry"; status: AdminRegistryStatus }
  | { kind: "sync"; status: McpToolSyncStatus };

export function resolveMcpServerDisplayStatus(
  registryStatus: AdminRegistryStatus,
  syncStatus: McpToolSyncStatus,
): McpServerDisplayStatus {
  return registryStatus === "ready"
    ? { kind: "sync", status: syncStatus }
    : { kind: "registry", status: registryStatus };
}

function catalogUpdateReason(frame: unknown): string {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) return "";
  const record = frame as Record<string, unknown>;
  if (registryText(record.type) !== "catalog.updated") return "";
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {};
  return registryText(data.reason);
}

interface McpCatalogSnapshot {
  items: AdminRegistryListItem[];
  tools: AdminToolSummary[];
}

export async function fetchMcpCatalogSnapshot(): Promise<McpCatalogSnapshot> {
  const [registryResponse, toolsResponse] = await Promise.all([
    getAdminRegistries(),
    getAdminTools(),
  ]);
  return {
    items: (registryResponse.data.items || []).filter(
      (item) => item.category === "mcp-servers",
    ),
    tools: Array.isArray(toolsResponse.data) ? toolsResponse.data : [],
  };
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

export function isMcpServerSaveDisabled({
  hasDetail,
  detailLoading,
  saving,
  validating,
}: {
  hasDetail: boolean;
  detailLoading: boolean;
  saving: boolean;
  validating: boolean;
}): boolean {
  return !hasDetail || detailLoading || saving || validating;
}

export function shouldLoadMcpServerDirectly({
  currentRouteKey,
  dirty,
  newDraft,
  selectedItemKey,
  targetItemKey,
  targetRouteKey,
}: {
  currentRouteKey: string;
  dirty: boolean;
  newDraft: boolean;
  selectedItemKey: string;
  targetItemKey: string;
  targetRouteKey: string;
}): boolean {
  return (
    dirty ||
    newDraft ||
    selectedItemKey === targetItemKey ||
    currentRouteKey === targetRouteKey
  );
}

export function selectMcpServerAfterDelete(
  previousItems: AdminRegistryListItem[],
  remainingItems: AdminRegistryListItem[],
  deletedFile: string,
): AdminRegistryListItem | null {
  if (remainingItems.length === 0) return null;
  const deletedIndex = previousItems.findIndex(
    (item) => item.file === deletedFile,
  );
  if (deletedIndex < 0) return remainingItems[0];
  return (
    remainingItems[Math.min(deletedIndex, remainingItems.length - 1)] ||
    remainingItems[0]
  );
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

function mcpDetailFromSource(
  source: AdminSourceResponse,
  fallback: Partial<AdminRegistryDetailResponse> = {},
): AdminRegistryDetailResponse {
  return {
    category: "mcp-servers",
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

interface McpDetailLoadResult {
  detail: AdminRegistryDetailResponse;
  item: AdminRegistryListItem;
  validationError: string;
}

export const McpServersPage = () => {
  const { t, locale } = useI18n();
  const push = usePushTransport();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ serverKey?: string }>();
  const routeServerKey = String(params.serverKey || "").trim();
  const routeSearch = location.search || "";
  const routeServerKeyRef = useRef(routeServerKey);
  const didLoadRef = useRef(false);
  const catalogRequestRef = useRef(0);
  const catalogPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<AdminRegistryListItem[]>([]);
  const detailScrollRef = useRef<HTMLElement | null>(null);
  const sectionNavLinksRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<AdminRegistryListItem[]>([]);
  const [tools, setTools] = useState<AdminToolSummary[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [detail, setDetail] = useState<AdminRegistryDetailResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [editorMode, setEditorMode] =
    useState<McpServerEditorMode>("structured");
  const [activeSectionId, setActiveSectionId] =
    useState<McpServerFormSectionId>(MCP_SERVER_FORM_SECTION_IDS[0]);
  const [form, setForm] = useState<McpServerFormState>(EMPTY_MCP_SERVER_FORM);
  const [baseDefinition, setBaseDefinition] = useState<Record<string, unknown>>(
    {},
  );
  const [structuredAvailable, setStructuredAvailable] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [toolSearchText, setToolSearchText] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [routeNotFound, setRouteNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newDraft, setNewDraft] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const detailRequestCoordinator = useMemo(
    () => createMcpDetailRequestCoordinator<McpDetailLoadResult>(),
    [],
  );

  const applyCatalogSnapshot = useCallback((snapshot: McpCatalogSnapshot) => {
    itemsRef.current = snapshot.items;
    setItems(snapshot.items);
    setTools(snapshot.tools);
    setDetail((current) => {
      if (!current) return current;
      const item = snapshot.items.find((candidate) => candidate.file === current.file);
      if (!item) return current;
      return {
        ...current,
        key: item.key,
        name: item.name,
        status: item.status,
        summary: item.summary,
        updatedAt: item.updatedAt,
      };
    });
  }, []);

  const refreshCatalog = useCallback(
    async (silent = true): Promise<McpCatalogSnapshot | null> => {
      const requestID = ++catalogRequestRef.current;
      if (!silent) setError("");
      try {
        const snapshot = await fetchMcpCatalogSnapshot();
        if (requestID !== catalogRequestRef.current) return null;
        applyCatalogSnapshot(snapshot);
        return snapshot;
      } catch (loadError) {
        if (!silent && requestID === catalogRequestRef.current) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
        return null;
      }
    },
    [applyCatalogSnapshot],
  );

  useEffect(() => {
    routeServerKeyRef.current = routeServerKey;
  }, [routeServerKey]);

  useEffect(() => {
    setActiveSectionId(MCP_SERVER_FORM_SECTION_IDS[0]);
  }, [editorMode, selectedItemKey]);

  useEffect(() => {
    if (editorMode !== "structured" || !structuredAvailable) return undefined;
    const scrollContainer = detailScrollRef.current;
    if (!scrollContainer) return undefined;

    let animationFrame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const nav =
          scrollContainer.querySelector<HTMLElement>(".mcp-section-nav");
        const activationLine =
          (nav?.getBoundingClientRect().bottom ??
            scrollContainer.getBoundingClientRect().top) + 8;
        const sectionTops = MCP_SERVER_FORM_SECTION_IDS.map((sectionId) => {
          const section = scrollContainer.querySelector<HTMLElement>(
            `#${sectionId}`,
          );
          return (
            section?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
          );
        });
        const atBottom =
          scrollContainer.scrollTop + scrollContainer.clientHeight >=
          scrollContainer.scrollHeight - 2;
        const nextSectionId = resolveActiveMcpServerFormSection(
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
  }, [editorMode, form.transport, selectedItemKey, structuredAvailable]);

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
  const formSections = useMemo(
    () => [
      {
        id: MCP_SERVER_FORM_SECTION_IDS[0],
        label: t("mcpServers.section.basic"),
      },
      {
        id: MCP_SERVER_FORM_SECTION_IDS[1],
        label: t("mcpServers.section.connection"),
      },
      {
        id: MCP_SERVER_FORM_SECTION_IDS[2],
        label: t("mcpServers.section.syncPolicy"),
      },
      {
        id: MCP_SERVER_FORM_SECTION_IDS[3],
        label: t("mcpServers.section.overview"),
      },
      {
        id: MCP_SERVER_FORM_SECTION_IDS[4],
        label: t("mcpServers.section.tools"),
      },
    ],
    [t],
  );
  const resolvedEndpoint = useMemo(() => resolvedMcpServerUrl(form), [form]);

  const updateForm = (patch: Partial<McpServerFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    setFormError("");
    setMessage("");
  };

  const handleSectionNavigate = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      sectionId: McpServerFormSectionId,
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

  const invalidateDetailLoad = useCallback(() => {
    detailRequestCoordinator.invalidate();
    setDetailLoading(false);
  }, [detailRequestCoordinator]);

  const loadDetail = useCallback(
    async (item: AdminRegistryListItem) => {
      const itemKey = mcpServerItemKey(item);
      const selection = detailRequestCoordinator.run(itemKey, async () => {
        const response = await getAdminSource({
          type: "registry",
          category: "mcp-servers",
          file: item.file,
        });
        const refreshedItem =
          itemsRef.current.find((candidate) => candidate.file === item.file) || item;
        let nextDetail = mcpDetailFromSource(response.data, refreshedItem);
        let validationError = "";
        try {
          const validation = await validateAdminRegistry({
            category: "mcp-servers",
            file: item.file,
            content: nextDetail.content || "",
          });
          nextDetail = {
            ...nextDetail,
            status: validation.data.status,
            diagnostics: validation.data.diagnostics,
            parsed: validation.data.parsed,
          };
        } catch (error) {
          validationError = error instanceof Error ? error.message : String(error);
        }
        return {
          detail: nextDetail,
          item: refreshedItem,
          validationError,
        };
      });

      setDetailLoading(true);
      setError("");
      setFormError("");
      try {
        const result = await selection.promise;
        if (!detailRequestCoordinator.isLatest(selection.selectionId)) return;
        if (result.validationError) setFormError(result.validationError);
        setSelectedItemKey(mcpServerItemKey(result.item));
        setDetail(result.detail);
        setDraft(result.detail.content || "");
        const definition = result.detail.parsed;
        if (definition) {
          setBaseDefinition(definition);
          setForm(
            mcpServerFormFromDefinition(
              definition,
              mcpServerKey(result.detail),
            ),
          );
          setStructuredAvailable(true);
          setEditorMode("structured");
        } else {
          setBaseDefinition({});
          setForm({
            ...EMPTY_MCP_SERVER_FORM,
            serverKey: mcpServerKey(result.detail),
          });
          setStructuredAvailable(false);
          setEditorMode("source");
        }
        setDirty(false);
        setNewDraft(false);
        setRouteNotFound(false);
      } catch (loadError) {
        if (detailRequestCoordinator.isLatest(selection.selectionId)) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (detailRequestCoordinator.isLatest(selection.selectionId)) {
          setDetailLoading(false);
        }
      }
    },
    [detailRequestCoordinator],
  );

  const loadPage = useCallback(
    async (
      preferredServerKey = "",
      preserveUnassigned = false,
    ) => {
      setLoading(true);
      setError("");
      try {
        const snapshot = await refreshCatalog(false);
        if (!snapshot) return;
        const nextItems = snapshot.items;

        if (preserveUnassigned) {
          invalidateDetailLoad();
          setShowUnassigned(true);
          setRouteNotFound(false);
          setSelectedItemKey("");
          setDetail(null);
          setDraft("");
          setForm(EMPTY_MCP_SERVER_FORM);
          setBaseDefinition({});
          return;
        }

        const target = preferredServerKey
          ? findMcpServerByRouteKey(nextItems, preferredServerKey)
          : nextItems[0] || null;
        if (preferredServerKey && !target) {
          invalidateDetailLoad();
          setSelectedItemKey("");
          setDetail(null);
          setDraft("");
          setForm(EMPTY_MCP_SERVER_FORM);
          setBaseDefinition({});
          setRouteNotFound(true);
          setShowUnassigned(false);
          return;
        }
        if (target) {
          setShowUnassigned(false);
          await loadDetail(target);
        } else {
          invalidateDetailLoad();
          setSelectedItemKey("");
          setDetail(null);
          setDraft("");
          setForm(EMPTY_MCP_SERVER_FORM);
          setBaseDefinition({});
          setRouteNotFound(false);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    },
    [invalidateDetailLoad, loadDetail, refreshCatalog],
  );

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadPage(routeServerKeyRef.current);
  }, [loadPage]);

  useEffect(() => {
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, (frame) => {
      const reason = catalogUpdateReason(frame);
      if (reason !== "mcp-servers" && reason !== "config") return;
      if (loading || detailLoading || saving) return;
      if (catalogPushTimerRef.current) {
        clearTimeout(catalogPushTimerRef.current);
      }
      catalogPushTimerRef.current = setTimeout(() => {
        catalogPushTimerRef.current = null;
        void refreshCatalog(true);
      }, MCP_CATALOG_PUSH_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (catalogPushTimerRef.current) {
        clearTimeout(catalogPushTimerRef.current);
        catalogPushTimerRef.current = null;
      }
    };
  }, [detailLoading, loading, push, refreshCatalog, saving]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible" && !loading && !saving) {
        void refreshCatalog(true);
      }
    };
    const interval = window.setInterval(
      refreshIfVisible,
      MCP_CATALOG_POLL_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loading, refreshCatalog, saving]);

  useEffect(() => {
    if (!didLoadRef.current || loading || newDraft || showUnassigned || dirty) return;
    if (!routeServerKey) return;
    const target = findMcpServerByRouteKey(items, routeServerKey);
    if (!target) {
      invalidateDetailLoad();
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
  }, [dirty, invalidateDetailLoad, items, loadDetail, loading, newDraft, routeServerKey, selectedItemKey, showUnassigned]);

  const confirmDiscard = () =>
    !dirty || window.confirm(t("mcpServers.confirm.discard"));

  const toggleEditorMode = () => {
    if (editorMode === "source" && !structuredAvailable) {
      setFormError(t("mcpServers.error.fixSourceFirst"));
      return;
    }
    if (!confirmDiscard()) return;
    setDirty(false);
    setFormError("");
    setMessage("");
    if (editorMode === "source") {
      setDraft(detail?.content || draft);
      setForm(
        mcpServerFormFromDefinition(
          baseDefinition,
          detail ? mcpServerKey(detail) : "",
        ),
      );
      setEditorMode("structured");
      return;
    }
    setForm(
      mcpServerFormFromDefinition(
        baseDefinition,
        detail ? mcpServerKey(detail) : "",
      ),
    );
    setEditorMode("source");
  };

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
    const loadDirectly = shouldLoadMcpServerDirectly({
      currentRouteKey: routeServerKey,
      dirty,
      newDraft,
      selectedItemKey,
      targetItemKey: mcpServerItemKey(item),
      targetRouteKey: serverKey,
    });
    setShowUnassigned(false);
    setRouteNotFound(false);
    setToolSearchText("");
    setMessage("");
    setDetailLoading(true);
    navigate(mcpServersRoutePath(serverKey, routeSearch));
    void (async () => {
      const snapshot = await refreshCatalog(true);
      const refreshedItem =
        snapshot?.items.find((candidate) => candidate.file === item.file) || item;
      if (loadDirectly) await loadDetail(refreshedItem);
    })();
  };

  const selectUnassigned = () => {
    if (!confirmDiscard()) return;
    invalidateDetailLoad();
    setShowUnassigned(true);
    setRouteNotFound(false);
    setDetail(null);
    setSelectedItemKey("");
    setEditorMode("structured");
    setForm(EMPTY_MCP_SERVER_FORM);
    setBaseDefinition({});
    setStructuredAvailable(true);
    setToolSearchText("");
    setDirty(false);
    setNewDraft(false);
    setMessage("");
    navigate(mcpServersRoutePath("", routeSearch));
  };

  const startNew = () => {
    if (!confirmDiscard()) return;
    invalidateDetailLoad();
    const file = defaultMcpServerFileName(items);
    const serverKey = file.replace(/\.ya?ml$/i, "");
    const initialForm: McpServerFormState = {
      ...EMPTY_MCP_SERVER_FORM,
      serverKey,
      baseUrl: "http://localhost:11969",
    };
    const definition = buildMcpServerDefinition(initialForm);
    const content = stringifyMcpServerYaml(definition);
    setSelectedItemKey(`mcp-servers/${file}`);
    setDetail({
      category: "mcp-servers",
      file,
      key: serverKey,
      status: "ready",
      summary: {},
      content,
      parsed: definition,
    });
    setDraft(content);
    setForm(initialForm);
    setBaseDefinition(definition);
    setStructuredAvailable(true);
    setEditorMode("structured");
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
    setFormError("");
    try {
      const targetFile =
        newDraft && editorMode === "structured"
          ? `${form.serverKey.trim()}.yml`
          : detail.file;
      if (
        newDraft &&
        items.some(
          (item) =>
            item.file.toLowerCase() === targetFile.toLowerCase() &&
            item.file !== detail.file,
        )
      ) {
        throw new Error(t("mcpServers.error.keyExists"));
      }
      const content =
        editorMode === "structured"
          ? stringifyMcpServerYaml(
              buildMcpServerDefinition(form, baseDefinition),
            )
          : draft;
      const response = await validateAdminRegistry({
        category: "mcp-servers",
        file: targetFile,
        content,
      });
      setDetail({
        ...detail,
        status: response.data.status,
        diagnostics: response.data.diagnostics,
        summary: mergeMcpValidationSummary(
          detail.summary,
          response.data.summary,
        ),
      });
      setMessage(
        response.data.status === "invalid"
          ? t("mcpServers.message.validationInvalid")
          : t("mcpServers.message.validationReady"),
      );
    } catch (validationError) {
      setFormError(
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
    setFormError("");
    try {
      const targetFile =
        newDraft && editorMode === "structured"
          ? `${form.serverKey.trim()}.yml`
          : detail.file;
      if (
        newDraft &&
        items.some(
          (item) =>
            item.file.toLowerCase() === targetFile.toLowerCase() &&
            item.file !== detail.file,
        )
      ) {
        throw new Error(t("mcpServers.error.keyExists"));
      }
      const content =
        editorMode === "structured"
          ? stringifyMcpServerYaml(
              buildMcpServerDefinition(form, baseDefinition),
            )
          : draft;
      const response = await updateAdminSource({
        target: {
          type: "registry",
          category: "mcp-servers",
          file: targetFile,
        },
        content,
        baseSha256: detail.sha256,
      });
      let nextDetail = mcpDetailFromSource(response.data, detail);
      const validation = await validateAdminRegistry({
        category: "mcp-servers",
        file: nextDetail.file,
        content: nextDetail.content || content,
      });
      nextDetail = {
        ...nextDetail,
        key:
          registryText(validation.data.parsed?.serverKey) ||
          registryText(validation.data.parsed?.["server-key"]) ||
          registryText(validation.data.parsed?.key) ||
          nextDetail.key,
        name:
          registryText(validation.data.parsed?.name) || nextDetail.name,
        status: validation.data.status,
        diagnostics: validation.data.diagnostics,
        summary: mergeMcpValidationSummary(
          detail.summary,
          validation.data.summary,
        ),
        parsed: validation.data.parsed,
      };
      const nextItem = detailToListItem(nextDetail);
      const nextRouteKey = mcpServerKey(nextDetail);
      setDetail(nextDetail);
      setDraft(nextDetail.content || content);
      if (nextDetail.parsed) {
        setBaseDefinition(nextDetail.parsed);
        setForm(
          mcpServerFormFromDefinition(nextDetail.parsed, nextRouteKey),
        );
        setStructuredAvailable(true);
      } else {
        setBaseDefinition({});
        setStructuredAvailable(false);
        setEditorMode("source");
      }
      setDirty(false);
      setNewDraft(false);
      setSelectedItemKey(mcpServerItemKey(nextItem));
      setMessage(t("mcpServers.message.saved"));
      const snapshot = await refreshCatalog(false);
      const refreshedItem = snapshot?.items.find(
        (candidate) => candidate.file === nextDetail.file,
      );
      const refreshedRouteKey = refreshedItem
        ? mcpServerKey(refreshedItem)
        : nextRouteKey;
      if (refreshedItem) {
        setSelectedItemKey(mcpServerItemKey(refreshedItem));
      }
      navigate(mcpServersRoutePath(refreshedRouteKey, routeSearch));
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!detail || newDraft) return;
    const deletedFile = detail.file;
    const previousItems = items;
    setDeleting(true);
    setError("");
    setFormError("");
    try {
      await deleteAdminSource({
        target: {
          type: "registry",
          category: "mcp-servers",
          file: deletedFile,
        },
        baseSha256: detail.sha256,
      });
      setDirty(false);
      const snapshot = await refreshCatalog(false);
      const remainingItems = snapshot?.items || previousItems.filter(
        (item) => item.file !== deletedFile,
      );
      if (!snapshot) {
        itemsRef.current = remainingItems;
        setItems(remainingItems);
        setTools((currentTools) =>
          currentTools.filter(
            (tool) => readToolMcpServerKey(tool) !== selectedServerKey,
          ),
        );
      }
      const nextItem = selectMcpServerAfterDelete(
        previousItems,
        remainingItems,
        deletedFile,
      );
      setMessage(t("mcpServers.message.deleted"));
      setToolSearchText("");
      if (nextItem) {
        const nextServerKey = mcpServerKey(nextItem);
        navigate(mcpServersRoutePath(nextServerKey, routeSearch));
        await loadDetail(nextItem);
      } else {
        invalidateDetailLoad();
        setSelectedItemKey("");
        setDetail(null);
        setDraft("");
        setForm(EMPTY_MCP_SERVER_FORM);
        setBaseDefinition({});
        setStructuredAvailable(true);
        setEditorMode("structured");
        setRouteNotFound(false);
        navigate(mcpServersRoutePath("", routeSearch));
      }
    } catch (deleteError) {
      setFormError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setDeleting(false);
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
  const selectedSyncStatus = readMcpToolSyncStatus(detail?.summary);
  const selectedSyncDiagnostic = readMcpSyncDiagnostic(detail?.summary);
  const lastSyncAttemptAt = summaryNumber(detail?.summary, "lastSyncAttemptAt");
  const lastSyncSuccessAt = summaryNumber(detail?.summary, "lastSyncSuccessAt");
  const selectedDisplayStatus = detail
    ? resolveMcpServerDisplayStatus(detail.status, selectedSyncStatus)
    : null;
  const saveDisabled = isMcpServerSaveDisabled({
    hasDetail: Boolean(detail),
    detailLoading,
    saving,
    validating,
  });

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
                disabled={loading || saving || deleting}
                onClick={refreshPage}
              >
                <MaterialIcon name="refresh" />
              </UiButton>
              <UiButton
                size="sm"
                variant="primary"
                iconOnly
                aria-label={t("mcpServers.action.new")}
                disabled={deleting}
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
                      const syncStatus = readMcpToolSyncStatus(item.summary);
                      const displayStatus = resolveMcpServerDisplayStatus(
                        item.status,
                        syncStatus,
                      );
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
                            <UiTag
                              tone={
                                displayStatus.kind === "sync"
                                  ? syncStatusTone(displayStatus.status)
                                  : statusTone(displayStatus.status)
                              }
                            >
                              {displayStatus.kind === "sync"
                                ? t(`mcpServers.syncStatus.${displayStatus.status}`)
                                : t(`registryConsole.status.${displayStatus.status}`)}
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

          <section
            ref={detailScrollRef}
            className={`${DETAIL_CLASS_NAME} ${editorMode === "source" ? "is-source-editor" : ""}`}
            aria-live="polite"
          >
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
                      {selectedDisplayStatus && (
                        <UiTag
                          tone={
                            selectedDisplayStatus.kind === "sync"
                              ? syncStatusTone(selectedDisplayStatus.status)
                              : statusTone(selectedDisplayStatus.status)
                          }
                        >
                          {selectedDisplayStatus.kind === "sync"
                            ? t(
                                `mcpServers.syncStatus.${selectedDisplayStatus.status}`,
                              )
                            : t(
                                `registryConsole.status.${selectedDisplayStatus.status}`,
                              )}
                        </UiTag>
                      )}
                      <UiButton
                        size="sm"
                        variant="ghost"
                        disabled={detailLoading || saving || deleting}
                        onClick={toggleEditorMode}
                      >
                        <MaterialIcon
                          name={editorMode === "source" ? "tune" : "code"}
                        />
                        <span>
                          {editorMode === "source"
                            ? t("mcpServers.action.structuredEdit")
                            : t("mcpServers.action.sourceEdit")}
                        </span>
                      </UiButton>
                      {!newDraft && (
                        <Popconfirm
                          title={t("mcpServers.confirm.deleteTitle")}
                          description={t("mcpServers.confirm.deleteDescription", {
                            name: detail.name || selectedServerKey || detail.file,
                          })}
                          okText={t("mcpServers.confirm.deleteOk")}
                          cancelText={t("mcpServers.confirm.deleteCancel")}
                          okButtonProps={{ danger: true }}
                          onConfirm={() => void confirmDelete()}
                          disabled={saving || validating || deleting}
                        >
                          <UiButton
                            size="sm"
                            variant="danger"
                            loading={deleting}
                            disabled={saving || validating || deleting}
                          >
                            <MaterialIcon name="delete" />
                            <span>{t("mcpServers.action.delete")}</span>
                          </UiButton>
                        </Popconfirm>
                      )}
                    </div>
                  </div>
                  {editorMode === "structured" && structuredAvailable && (
                    <nav
                      className={MCP_SECTION_NAV_CLASS_NAME}
                      aria-label={t("mcpServers.sectionNav.ariaLabel")}
                    >
                      <div
                        ref={sectionNavLinksRef}
                        className={MCP_SECTION_NAV_LINKS_CLASS_NAME}
                      >
                        {formSections.map((section) => (
                          <a
                            className={MCP_SECTION_NAV_LINK_CLASS_NAME}
                            href={`#${section.id}`}
                            aria-current={
                              activeSectionId === section.id
                                ? "location"
                                : undefined
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
                      <div className={MCP_SECTION_NAV_ACTIONS_CLASS_NAME}>
                        <UiButton
                          size="sm"
                          variant="ghost"
                          disabled={newDraft || detailLoading || deleting}
                          onClick={refreshPage}
                        >
                          <MaterialIcon name="refresh" />
                          <span>{t("mcpServers.action.refresh")}</span>
                        </UiButton>
                        <UiButton
                          size="sm"
                          variant="secondary"
                          loading={validating}
                          disabled={saving || detailLoading || deleting}
                          onClick={() => void validateDraft()}
                        >
                          <MaterialIcon name="rule" />
                          <span>{t("mcpServers.action.validate")}</span>
                        </UiButton>
                        <UiButton
                          size="sm"
                          variant="primary"
                          loading={saving}
                          disabled={saveDisabled || deleting}
                          onClick={() => void saveDraft()}
                        >
                          <MaterialIcon name="save" />
                          <span>{t("mcpServers.action.save")}</span>
                        </UiButton>
                      </div>
                    </nav>
                  )}

                  {formError && <div className="settings-error">{formError}</div>}

                  {editorMode === "source" ? (
                    <div className={MCP_SOURCE_WORKSPACE_CLASS_NAME}>
                      <div className="field-group automation-source-field registry-editor-field">
                        <label htmlFor="mcp-server-yaml-editor">
                          {t("mcpServers.config.label")}
                        </label>
                        <p
                          id="mcp-server-config-hint"
                          className="tw:mb-3 tw:text-xs tw:leading-[1.45] tw:text-ink-muted"
                        >
                          {t("mcpServers.config.sourceHint")}
                        </p>
                        <Input.TextArea
                          id="mcp-server-yaml-editor"
                          aria-describedby="mcp-server-config-hint"
                          className={EDITOR_CLASS_NAME}
                          value={draft}
                          disabled={saving}
                          onChange={(event) => {
                            setDraft(event.target.value);
                            setDirty(true);
                            setFormError("");
                            setMessage("");
                          }}
                        />
                      </div>
                      <div className="automation-save-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                        <UiButton
                          size="sm"
                          variant="ghost"
                          disabled={newDraft || detailLoading || deleting}
                          onClick={refreshPage}
                        >
                          <MaterialIcon name="refresh" />
                          <span>{t("mcpServers.action.refresh")}</span>
                        </UiButton>
                        <UiButton
                          size="sm"
                          variant="secondary"
                          loading={validating}
                          disabled={saving || detailLoading || deleting}
                          onClick={() => void validateDraft()}
                        >
                          <MaterialIcon name="rule" />
                          <span>{t("mcpServers.action.validate")}</span>
                        </UiButton>
                        <UiButton
                          size="sm"
                          variant="primary"
                          loading={saving}
                          disabled={saveDisabled || deleting}
                          onClick={() => void saveDraft()}
                        >
                          <MaterialIcon name="save" />
                          <span>{t("mcpServers.action.saveSource")}</span>
                        </UiButton>
                        <span className="tw:text-xs tw:text-ink-muted">
                          {dirty
                            ? t("mcpServers.config.dirty")
                            : t("mcpServers.config.readyToEdit")}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <McpFormSection
                        active={
                          activeSectionId === MCP_SERVER_FORM_SECTION_IDS[0]
                        }
                        id={MCP_SERVER_FORM_SECTION_IDS[0]}
                        icon="settings"
                        title={t("mcpServers.section.basic")}
                      >
                        <div className={MCP_FORM_GRID_CLASS_NAME}>
                          <div className="field-group">
                            <label htmlFor="mcp-server-key-input">
                              {t("mcpServers.field.serverKey")}
                            </label>
                            <Input
                              id="mcp-server-key-input"
                              value={form.serverKey}
                              disabled={!newDraft || saving}
                              onChange={(event) =>
                                updateForm({ serverKey: event.target.value })
                              }
                            />
                          </div>
                          <div className="field-group">
                            <label htmlFor="mcp-server-name-input">
                              {t("mcpServers.field.name")}
                            </label>
                            <Input
                              id="mcp-server-name-input"
                              value={form.name}
                              disabled={saving}
                              onChange={(event) =>
                                updateForm({ name: event.target.value })
                              }
                            />
                          </div>
                          <div className="field-group">
                            <label htmlFor="mcp-server-transport-select">
                              {t("mcpServers.field.transport")}
                            </label>
                            <Select
                              id="mcp-server-transport-select"
                              value={form.transport}
                              disabled={saving}
                              options={[
                                {
                                  value: "streamable-http",
                                  label: "streamable-http",
                                },
                                { value: "stdio", label: "stdio" },
                              ]}
                              onChange={(value) =>
                                updateForm({ transport: value })
                              }
                            />
                          </div>
                          <div className="field-group">
                            <label htmlFor="mcp-server-enabled-switch">
                              {t("mcpServers.field.enabled")}
                            </label>
                            <div className="tw:flex tw:min-h-8 tw:items-center tw:gap-2">
                              <Switch
                                id="mcp-server-enabled-switch"
                                checked={form.enabled}
                                disabled={saving}
                                onChange={(enabled) => updateForm({ enabled })}
                              />
                              <span className="tw:text-xs tw:text-ink-muted">
                                {form.enabled
                                  ? t("mcpServers.value.enabled")
                                  : t("mcpServers.value.disabled")}
                              </span>
                            </div>
                          </div>
                          <div className="field-group">
                            <label htmlFor="mcp-server-prefix-input">
                              {t("mcpServers.field.toolPrefix")}
                            </label>
                            <Input
                              id="mcp-server-prefix-input"
                              value={form.toolPrefix}
                              disabled={saving}
                              onChange={(event) =>
                                updateForm({ toolPrefix: event.target.value })
                              }
                            />
                          </div>
                          <div className="field-group">
                            <label htmlFor="mcp-server-protocol-input">
                              {t("mcpServers.field.protocolVersion")}
                            </label>
                            <Input
                              id="mcp-server-protocol-input"
                              value="2025-11-25"
                              disabled
                            />
                          </div>
                        </div>
                      </McpFormSection>

                      <McpFormSection
                        active={
                          activeSectionId === MCP_SERVER_FORM_SECTION_IDS[1]
                        }
                        id={MCP_SERVER_FORM_SECTION_IDS[1]}
                        icon="hub"
                        title={t("mcpServers.section.connection")}
                      >
                        <div className={MCP_FORM_GRID_CLASS_NAME}>
                          {form.transport === "streamable-http" ? (
                            <>
                              <div className={MCP_FORM_FULL_WIDTH_CLASS_NAME}>
                                <label htmlFor="mcp-server-base-url-input">
                                  {t("mcpServers.field.baseUrl")}
                                </label>
                                <Input
                                  id="mcp-server-base-url-input"
                                  value={form.baseUrl}
                                  disabled={saving}
                                  placeholder="https://mcp.example.com"
                                  onChange={(event) =>
                                    updateForm({ baseUrl: event.target.value })
                                  }
                                />
                                <span className="tw:text-[11px] tw:text-ink-muted">
                                  {t("mcpServers.hint.baseUrl")}
                                </span>
                              </div>
                              <div className="field-group">
                                <label htmlFor="mcp-server-endpoint-path-input">
                                  {t("mcpServers.field.endpointPath")}
                                </label>
                                <Input
                                  id="mcp-server-endpoint-path-input"
                                  value={form.endpointPath}
                                  disabled={saving}
                                  placeholder="/mcp"
                                  onChange={(event) =>
                                    updateForm({
                                      endpointPath: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="field-group tw:col-span-2 tw:max-[860px]:col-span-1">
                                <label htmlFor="mcp-server-resolved-url-input">
                                  {t("mcpServers.field.resolvedUrl")}
                                </label>
                                <Input
                                  id="mcp-server-resolved-url-input"
                                  value={resolvedEndpoint}
                                  disabled
                                />
                              </div>
                              <div className={MCP_FORM_FULL_WIDTH_CLASS_NAME}>
                                <label htmlFor="mcp-server-auth-token-input">
                                  {t("mcpServers.field.authToken")}
                                </label>
                                <Input
                                  id="mcp-server-auth-token-input"
                                  type="password"
                                  autoComplete="off"
                                  value={form.authToken}
                                  disabled={saving}
                                  onChange={(event) =>
                                    updateForm({ authToken: event.target.value })
                                  }
                                />
                              </div>
                              <div className={MCP_FORM_FULL_WIDTH_CLASS_NAME}>
                                <label htmlFor="mcp-server-headers-input">
                                  {t("mcpServers.field.headers")}
                                </label>
                                <Input.TextArea
                                  id="mcp-server-headers-input"
                                  className="settings-textarea automation-mono-textarea tw:font-code"
                                  rows={4}
                                  value={form.headersText}
                                  disabled={saving}
                                  placeholder={t(
                                    "mcpServers.placeholder.header",
                                  )}
                                  onChange={(event) =>
                                    updateForm({ headersText: event.target.value })
                                  }
                                />
                                <span className="tw:text-[11px] tw:text-ink-muted">
                                  {t("mcpServers.hint.keyValueLines")}
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={MCP_FORM_FULL_WIDTH_CLASS_NAME}>
                                <label htmlFor="mcp-server-command-input">
                                  {t("mcpServers.field.command")}
                                </label>
                                <Input
                                  id="mcp-server-command-input"
                                  value={form.command}
                                  disabled={saving}
                                  onChange={(event) =>
                                    updateForm({ command: event.target.value })
                                  }
                                />
                              </div>
                              <div className={MCP_FORM_FULL_WIDTH_CLASS_NAME}>
                                <label htmlFor="mcp-server-working-dir-input">
                                  {t("mcpServers.field.workingDirectory")}
                                </label>
                                <Input
                                  id="mcp-server-working-dir-input"
                                  value={form.workingDirectory}
                                  disabled={saving}
                                  onChange={(event) =>
                                    updateForm({
                                      workingDirectory: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="field-group tw:col-span-3 tw:max-[860px]:col-span-1">
                                <label htmlFor="mcp-server-args-input">
                                  {t("mcpServers.field.args")}
                                </label>
                                <Input.TextArea
                                  id="mcp-server-args-input"
                                  className="settings-textarea automation-mono-textarea tw:font-code"
                                  rows={4}
                                  value={form.argsText}
                                  disabled={saving}
                                  onChange={(event) =>
                                    updateForm({ argsText: event.target.value })
                                  }
                                />
                                <span className="tw:text-[11px] tw:text-ink-muted">
                                  {t("mcpServers.hint.onePerLine")}
                                </span>
                              </div>
                              <div className={MCP_FORM_FULL_WIDTH_CLASS_NAME}>
                                <label htmlFor="mcp-server-env-input">
                                  {t("mcpServers.field.env")}
                                </label>
                                <Input.TextArea
                                  id="mcp-server-env-input"
                                  className="settings-textarea automation-mono-textarea tw:font-code"
                                  rows={4}
                                  value={form.envText}
                                  disabled={saving}
                                  onChange={(event) =>
                                    updateForm({ envText: event.target.value })
                                  }
                                />
                                <span className="tw:text-[11px] tw:text-ink-muted">
                                  {t("mcpServers.hint.keyValueLines")}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </McpFormSection>

                      <McpFormSection
                        active={
                          activeSectionId === MCP_SERVER_FORM_SECTION_IDS[2]
                        }
                        id={MCP_SERVER_FORM_SECTION_IDS[2]}
                        icon="tune"
                        title={t("mcpServers.section.syncPolicy")}
                      >
                        <div className={MCP_FORM_GRID_CLASS_NAME}>
                          {[
                            ["connectTimeout", "connect-timeout"],
                            ["startupTimeout", "startup-timeout"],
                            ["readTimeout", "read-timeout"],
                            ["retry", "retry"],
                          ].map(([field, label]) => (
                            <div className="field-group" key={field}>
                              <label htmlFor={`mcp-server-${field}-input`}>
                                {label}
                              </label>
                              <Input
                                id={`mcp-server-${field}-input`}
                                type="number"
                                min={0}
                                value={form[field as keyof McpServerFormState] as string}
                                disabled={saving}
                                onChange={(event) =>
                                  updateForm({
                                    [field]: event.target.value,
                                  } as Partial<McpServerFormState>)
                                }
                              />
                            </div>
                          ))}
                          <div className={MCP_FORM_FULL_WIDTH_CLASS_NAME}>
                            <label htmlFor="mcp-server-alias-map-input">
                              {t("mcpServers.field.aliasMap")}
                            </label>
                            <Input.TextArea
                              id="mcp-server-alias-map-input"
                              className="settings-textarea automation-mono-textarea tw:font-code"
                              rows={4}
                              value={form.aliasMapText}
                              disabled={saving}
                              onChange={(event) =>
                                updateForm({ aliasMapText: event.target.value })
                              }
                            />
                            <span className="tw:text-[11px] tw:text-ink-muted">
                              {t("mcpServers.hint.aliasMap")}
                            </span>
                          </div>
                          <p className="tw:col-span-3 tw:m-0 tw:text-[11px] tw:text-ink-muted tw:max-[860px]:col-span-1">
                            {t("mcpServers.hint.advancedPreserved")}
                          </p>
                        </div>
                      </McpFormSection>

                      <McpFormSection
                        active={
                          activeSectionId === MCP_SERVER_FORM_SECTION_IDS[3]
                        }
                        id={MCP_SERVER_FORM_SECTION_IDS[3]}
                        icon="assignment"
                        title={t("mcpServers.section.overview")}
                      >
                    <div className={META_GRID_CLASS_NAME}>
                      <span>{t("mcpServers.field.baseUrl")}: {resolvedEndpoint || registryText(detail.summary?.baseUrl) || "--"}</span>
                      <span>{t("mcpServers.field.file")}: {detail.file}</span>
                      <span>{t("mcpServers.field.updatedAt")}: {formatEpochMillisLocal(detail.updatedAt, locale)}</span>
                      <span>
                        {t("mcpServers.field.toolSync")}: {t(`mcpServers.syncStatus.${selectedSyncStatus}`)} · {selectedTools.length}
                        {expectedToolCount === undefined ? "" : ` / ${expectedToolCount}`}
                      </span>
                      {lastSyncAttemptAt !== undefined && (
                        <span>
                          {t("mcpServers.field.lastSyncAttempt")}: {formatEpochMillisLocal(lastSyncAttemptAt, locale)}
                        </span>
                      )}
                      {lastSyncSuccessAt !== undefined && (
                        <span>
                          {t("mcpServers.field.lastSyncSuccess")}: {formatEpochMillisLocal(lastSyncSuccessAt, locale)}
                        </span>
                      )}
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
                      </McpFormSection>

                      <McpFormSection
                        active={
                          activeSectionId === MCP_SERVER_FORM_SECTION_IDS[4]
                        }
                        id={MCP_SERVER_FORM_SECTION_IDS[4]}
                        icon="bolt"
                        title={t("mcpServers.section.toolsCount", {
                          count: selectedTools.length,
                        })}
                      >
                    {(selectedSyncStatus === "pending" || selectedSyncStatus === "syncing") && (
                      <div className={`${MESSAGE_CLASS_NAME} tw:mb-3`}>
                        {t("mcpServers.tools.syncing")}
                      </div>
                    )}
                    {selectedSyncStatus === "unavailable" && (
                      <div className={`${ERROR_CLASS_NAME} tw:mb-3`}>
                        <span>
                          {selectedSyncDiagnostic
                            ? `${selectedSyncDiagnostic.code}: ${selectedSyncDiagnostic.message}`
                            : t("mcpServers.tools.unavailable")}
                          {selectedTools.length > 0
                            ? ` · ${t("mcpServers.tools.lastKnownSnapshot")}`
                            : ""}
                        </span>
                      </div>
                    )}
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
                          {selectedSyncStatus === "pending" || selectedSyncStatus === "syncing"
                            ? t("mcpServers.tools.syncing")
                            : selectedSyncStatus === "unavailable"
                              ? t("mcpServers.tools.unavailableEmpty")
                              : selectedSyncStatus === "disabled"
                                ? t("mcpServers.tools.disabled")
                                : expectedToolCount && expectedToolCount > 0
                                  ? t("mcpServers.tools.emptyMissingAssignment")
                                  : t("mcpServers.tools.emptyReady")}
                        </div>
                      )}
                    </div>
                      </McpFormSection>
                    </>
                  )}
                </>
              )}
            </Spin>
          </section>
        </div>
      </div>
    </main>
  );
};

import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { FileChangeSummary, PublishedArtifact } from "@/app/state/types";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import { FileDiffView } from "@/app/layout/sidebar/right/FileDiffView";
import { getFileHistory } from "@/shared/data";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { Collapse, Flex } from "antd";

export function getFileIcon(filePath: string): MaterialIconName {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, MaterialIconName> = {
    ts: "code",
    tsx: "code",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    css: "css",
    scss: "css",
    sass: "css",
    less: "css",
    html: "html",
    htm: "html",
    json: "data_object",
    md: "description",
    mdx: "description",
    py: "code",
    java: "code",
    go: "code",
    rs: "code",
    sh: "terminal",
    bash: "terminal",
    zsh: "terminal",
    yaml: "description",
    yml: "description",
    toml: "settings",
    xml: "code",
    svg: "image",
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    webp: "image",
    ico: "image",
    txt: "description",
    lock: "lock",
    env: "settings",
    properties: "settings",
  };
  return map[ext] ?? "description";
}

export interface OverviewArtifactItem {
  artifactId: string;
  artifact: PublishedArtifact["artifact"];
  timestamp: number;
}

export function buildOverviewArtifactItems(
  artifacts: PublishedArtifact[],
): OverviewArtifactItem[] {
  return [...artifacts]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .map((item) => ({
      artifactId: item.artifactId,
      artifact: item.artifact,
      timestamp: item.timestamp || 0,
    }));
}

export interface OverviewFileChangeItem {
  runId: string;
  filePath: string;
  addedLines: number;
  deletedLines: number;
  editedLines: number;
  operationCount: number;
  lastUpdatedAt: number;
}

const FILE_CHANGE_JUMP_DURATION_MS = 560;

const RIGHT_SIDEBAR_OVERVIEW_CLASS_NAME =
  "right-sidebar-overview tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:gap-3.5 tw:overflow-y-auto";

const RIGHT_SIDEBAR_OVERVIEW_SECTION_CLASS_NAME =
  "right-sidebar-overview-section tw:flex tw:min-w-0 tw:flex-col tw:gap-2";

const RIGHT_SIDEBAR_OVERVIEW_SECTION_HEAD_CLASS_NAME =
  "right-sidebar-overview-section-head tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-[10px]";

const RIGHT_SIDEBAR_OVERVIEW_SECTION_TITLE_CLASS_NAME =
  "tw:m-0 tw:text-[13px] tw:font-bold tw:text-ink-1";

const RIGHT_SIDEBAR_OVERVIEW_SECTION_COUNT_CLASS_NAME =
  "right-sidebar-overview-section-count tw:text-[11px] tw:font-bold tw:text-accent-electric-strong";

const RIGHT_SIDEBAR_EMPTY_CLASS_NAME =
  "right-sidebar-empty tw:rounded-lg tw:border tw:border-dashed tw:border-line-soft tw:px-3 tw:py-3.5 tw:text-center tw:text-xs tw:text-ink-muted tw:mx-[10px]";

const FILE_CHANGE_ICON_CLASS_NAME =
  "right-sidebar-file-change-icon tw:flex-none tw:text-ink-muted";

const FILE_CHANGE_PATH_CLASS_NAME =
  "right-sidebar-file-change-path tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:leading-[1.35] tw:text-ink-1";

const FILE_CHANGE_RUN_CLASS_NAME =
  "right-sidebar-file-change-run tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:text-[12px] tw:leading-[1.25] tw:text-ink-muted";

const FILE_CHANGE_STATS_CLASS_NAME =
  "right-sidebar-file-change-stats tw:inline-flex tw:flex-none tw:items-center tw:gap-1 tw:whitespace-nowrap tw:font-code tw:text-[11px] tw:font-bold tw:leading-[1.2]";

const FILE_CHANGE_STAT_ANIMATION_CLASS_NAME =
  "tw:origin-bottom tw:animate-[right-sidebar-file-change-jump_560ms_cubic-bezier(.2,.72,.18,1)] tw:motion-reduce:animate-none";

const FILE_CHANGE_DELETE_ANIMATION_CLASS_NAME = "tw:[animation-delay:40ms]";

const FILE_CHANGE_ADD_CLASS_NAME = "right-sidebar-file-change-add tw:text-ok";

const FILE_CHANGE_DELETE_CLASS_NAME =
  "right-sidebar-file-change-delete tw:text-danger";

const FILE_CHANGE_DIFF_CLASS_NAME =
  "right-sidebar-file-change-diff tw:w-full tw:min-w-0 tw:border-t tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-surface)_86%,transparent)]";

const FILE_DIFF_STATUS_CLASS_NAME =
  "right-sidebar-file-diff-status tw:flex tw:min-h-10 tw:items-center tw:justify-center tw:gap-2 tw:p-2.5 tw:text-xs tw:text-ink-muted";

const FILE_DIFF_STATUS_ERROR_CLASS_NAME = "is-error tw:text-danger";

const FILE_DIFF_ERROR_STATUS_CLASS_NAME = [
  FILE_DIFF_STATUS_CLASS_NAME,
  FILE_DIFF_STATUS_ERROR_CLASS_NAME,
].join(" ");

const FILE_DIFF_SPINNER_CLASS_NAME =
  "right-sidebar-file-diff-spinner tw:h-3.5 tw:w-3.5 tw:animate-[ui-spin_900ms_linear_infinite] tw:rounded-full tw:border-2 tw:[border-color:color-mix(in_srgb,var(--ink-muted)_22%,transparent)] tw:[border-top-color:var(--accent-electric)] tw:motion-reduce:animate-none";

const PLANNING_LIST_CLASS_NAME =
  "right-sidebar-planning-list tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-1.5 tw:p-0";

const PLANNING_ITEM_CLASS_NAME =
  "right-sidebar-planning-item tw:w-full tw:flex tw:min-w-0 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_78%,white)] tw:px-2.5 tw:py-2 tw:text-left tw:text-inherit tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_38%,transparent)]";

const PLANNING_ITEM_ICON_CLASS_NAME =
  "right-sidebar-planning-item-icon tw:flex-none tw:text-base tw:text-accent-electric-strong";

const PLANNING_ITEM_TEXT_CLASS_NAME =
  "right-sidebar-planning-item-text tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[12px] tw:leading-[1.35] tw:text-ink-1";

const ARTIFACT_DRAWER_LIST_CLASS_NAME =
  "artifact-drawer-list right-sidebar-artifact-list tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2.5 tw:overflow-visible tw:p-0";

const ARTIFACT_DRAWER_ITEM_CLASS_NAME =
  "artifact-drawer-item tw:min-w-0 tw:list-none tw:[&_.attachment-card-file-shell]:flex-nowrap";

export type FileHistoryCacheEntry =
  | { status: "loading" }
  | { status: "loaded"; original: string; current: string }
  | { status: "error" };

type FileHistoryCache = Record<string, FileHistoryCacheEntry>;
type FileHistoryCacheUpdater = (
  update: (current: FileHistoryCache) => FileHistoryCache,
) => void;
type FileHistoryFetcher = typeof getFileHistory;

export async function loadFileHistoryForCache(params: {
  chatId: string;
  item: Pick<OverviewFileChangeItem, "runId" | "filePath">;
  cache: FileHistoryCache;
  updateCache: FileHistoryCacheUpdater;
  fetchHistory?: FileHistoryFetcher;
}): Promise<"loaded" | "error" | "skipped"> {
  const {
    chatId,
    item,
    cache,
    updateCache,
    fetchHistory = getFileHistory,
  } = params;
  const cacheKey = buildFileHistoryCacheKey(chatId, item);
  if (!chatId || !item.runId || !item.filePath) {
    updateCache((current) => ({
      ...current,
      [cacheKey]: { status: "error" },
    }));
    return "error";
  }
  const existing = cache[cacheKey];
  if (existing && existing.status !== "error") {
    return "skipped";
  }
  updateCache((current) => ({
    ...current,
    [cacheKey]: { status: "loading" },
  }));
  try {
    const [original, current] = await Promise.all([
      fetchHistory({
        chatId,
        runId: item.runId,
        filePath: item.filePath,
        version: "original",
      }),
      fetchHistory({
        chatId,
        runId: item.runId,
        filePath: item.filePath,
        version: "current",
      }),
    ]);
    updateCache((nextCache) => ({
      ...nextCache,
      [cacheKey]: {
        status: "loaded",
        original: original.data.content || "",
        current: current.data.content || "",
      },
    }));
    return "loaded";
  } catch {
    updateCache((current) => ({
      ...current,
      [cacheKey]: { status: "error" },
    }));
    return "error";
  }
}

export function buildFileChangeKey(runId: string, filePath: string): string {
  return `${runId}\u0000${filePath}`;
}

export function buildFileHistoryCacheKey(
  chatId: string,
  item: Pick<OverviewFileChangeItem, "runId" | "filePath">,
): string {
  return `${chatId}\u0000${item.runId}\u0000${item.filePath}`;
}

export function buildOverviewFileChangeItems(
  fileChanges: FileChangeSummary[],
): OverviewFileChangeItem[] {
  return [...fileChanges]
    .sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0))
    .map((item) => ({
      runId: item.runId || "",
      filePath: item.filePath,
      addedLines: item.addedLines || 0,
      deletedLines: item.deletedLines || 0,
      editedLines: item.editedLines || 0,
      operationCount: item.operationCount || 0,
      lastUpdatedAt: item.lastUpdatedAt || 0,
    }));
}

export function buildFileChangeAnimationSignatures(
  fileChanges: OverviewFileChangeItem[],
): Map<string, string> {
  return new Map(
    fileChanges.map((item) => [
      buildFileChangeKey(item.runId, item.filePath),
      [
        item.runId,
        item.addedLines,
        item.deletedLines,
        item.editedLines,
        item.operationCount,
        item.lastUpdatedAt,
      ].join(":"),
    ]),
  );
}

export function resolveAnimatedFileChangePaths(
  previous: Map<string, string>,
  next: Map<string, string>,
): string[] {
  const changedPaths: string[] = [];
  for (const [filePath, signature] of next.entries()) {
    if (previous.get(filePath) !== signature) {
      changedPaths.push(filePath);
    }
  }
  return changedPaths;
}

function formatLineCount(value: number): string {
  return Math.max(0, value || 0).toLocaleString();
}

function displayFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || filePath;
}

function renderFileChangeStats(
  addedLines: number,
  deletedLines: number,
  options: { animated?: boolean; animationKey?: string } = {},
) {
  const addClassName = [
    FILE_CHANGE_ADD_CLASS_NAME,
    options.animated ? FILE_CHANGE_STAT_ANIMATION_CLASS_NAME : "",
  ]
    .filter(Boolean)
    .join(" ");
  const deleteClassName = [
    FILE_CHANGE_DELETE_CLASS_NAME,
    options.animated ? FILE_CHANGE_STAT_ANIMATION_CLASS_NAME : "",
    options.animated ? FILE_CHANGE_DELETE_ANIMATION_CLASS_NAME : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!addedLines && !deletedLines) {
    return null;
  }
  return (
    <span key={options.animationKey} className={FILE_CHANGE_STATS_CLASS_NAME}>
      <span className={addClassName}>+{formatLineCount(addedLines)}</span>
      <span className={deleteClassName}>-{formatLineCount(deletedLines)}</span>
    </span>
  );
}

function renderFileHistoryPanel(entry: FileHistoryCacheEntry | undefined) {
  if (!entry || entry.status === "loading") {
    return (
      <div className={FILE_DIFF_STATUS_CLASS_NAME}>
        <span className={FILE_DIFF_SPINNER_CLASS_NAME} aria-hidden="true" />
        {t("rightSidebar.overview.fileChanges.diffLoading")}
      </div>
    );
  }
  if (entry.status === "error") {
    return (
      <div className={FILE_DIFF_ERROR_STATUS_CLASS_NAME}>
        {t("rightSidebar.overview.fileChanges.diffUnavailable")}
      </div>
    );
  }
  return <FileDiffView original={entry.original} current={entry.current} />;
}

const OverviewSection: React.FC<{
  title: string;
  count: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, count, children }) => {
  return (
    <section className={RIGHT_SIDEBAR_OVERVIEW_SECTION_CLASS_NAME}>
      <div className={RIGHT_SIDEBAR_OVERVIEW_SECTION_HEAD_CLASS_NAME}>
        <h3 className={RIGHT_SIDEBAR_OVERVIEW_SECTION_TITLE_CLASS_NAME}>
          {title}
        </h3>
        <div className={RIGHT_SIDEBAR_OVERVIEW_SECTION_COUNT_CLASS_NAME}>
          {count}
        </div>
      </div>
      {children}
    </section>
  );
};

export const OverviewTab: React.FC = () => {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const [fileChangeAnimation, setFileChangeAnimation] = React.useState<{
    version: number;
    paths: Set<string>;
    total: boolean;
  }>({
    version: 0,
    paths: new Set(),
    total: false,
  });
  const [expandedFileChangeKeys, setExpandedFileChangeKeys] = React.useState<
    Set<string>
  >(new Set());
  const [fileHistoryCache, setFileHistoryCache] =
    React.useState<FileHistoryCache>({});
  const previousFileChangeSignaturesRef = React.useRef<Map<
    string,
    string
  > | null>(null);
  const artifacts = React.useMemo(
    () => buildOverviewArtifactItems(state.artifacts),
    [state.artifacts],
  );
  const fileChanges = React.useMemo(
    () => buildOverviewFileChangeItems(state.fileChanges),
    [state.fileChanges],
  );
  const fileChangeTotals = React.useMemo(
    () =>
      fileChanges.reduce(
        (totals, item) => ({
          addedLines: totals.addedLines + item.addedLines,
          deletedLines: totals.deletedLines + item.deletedLines,
        }),
        { addedLines: 0, deletedLines: 0 },
      ),
    [fileChanges],
  );
  const isCoder = React.useMemo(() => {
    const worker = resolveCurrentWorkerSummary(state);
    if (!worker || worker.type !== "agent") return false;
    return (
      String(
        (worker.raw as Record<string, unknown> | null)?.["mode"] || "",
      ).toUpperCase() === "CODER"
    );
  }, [state]);

  const planningNodes = React.useMemo(() => {
    const nodes: { id: string; text: string; status: string }[] = [];
    for (const [id, node] of state.timelineNodes) {
      if (node.kind === "planning" && node.text) {
        nodes.push({ id, text: node.text, status: node.status || "" });
      }
    }
    return nodes;
  }, [state.timelineNodes]);

  const handlePlanningClick = React.useCallback(
    (nodeId: string, label: string) => {
      dispatch({
        type: "OPEN_RIGHT_SIDEBAR",
        tab: "planningPreview",
        planningPreview: { nodeId, label },
      });
    },
    [dispatch],
  );

  React.useEffect(() => {
    const nextSignatures = buildFileChangeAnimationSignatures(fileChanges);
    const previousSignatures = previousFileChangeSignaturesRef.current;
    previousFileChangeSignaturesRef.current = nextSignatures;

    if (!previousSignatures) {
      return;
    }

    const changedPaths = resolveAnimatedFileChangePaths(
      previousSignatures,
      nextSignatures,
    );
    if (!state.rightSidebarOpen || changedPaths.length === 0) {
      return;
    }

    setFileChangeAnimation((current) => ({
      version: current.version + 1,
      paths: new Set(changedPaths),
      total: true,
    }));

    const timer = window.setTimeout(() => {
      setFileChangeAnimation((current) => ({
        ...current,
        paths: new Set(),
        total: false,
      }));
    }, FILE_CHANGE_JUMP_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [fileChanges, state.rightSidebarOpen]);

  const loadFileHistory = React.useCallback(
    (item: OverviewFileChangeItem) => {
      void loadFileHistoryForCache({
        chatId: state.chatId,
        item,
        cache: fileHistoryCache,
        updateCache: setFileHistoryCache,
      });
    },
    [fileHistoryCache, state.chatId],
  );

  const toggleFileChange = React.useCallback(
    (item: OverviewFileChangeItem) => {
      const itemKey = buildFileChangeKey(item.runId, item.filePath);
      const expanding = !expandedFileChangeKeys.has(itemKey);
      setExpandedFileChangeKeys((current) => {
        const next = new Set(current);
        if (next.has(itemKey)) {
          next.delete(itemKey);
        } else {
          next.add(itemKey);
        }
        return next;
      });
      if (expanding) {
        loadFileHistory(item);
      }
    },
    [expandedFileChangeKeys, loadFileHistory],
  );

  return (
    <div className={RIGHT_SIDEBAR_OVERVIEW_CLASS_NAME}>
      <OverviewSection
        title={
          isCoder
            ? t("rightSidebar.overview.fileChanges.titleCoder")
            : t("rightSidebar.overview.fileChanges.title")
        }
        count={renderFileChangeStats(
          fileChangeTotals.addedLines,
          fileChangeTotals.deletedLines,
          {
            animated: fileChangeAnimation.total,
            animationKey: `total-${fileChangeAnimation.version}`,
          },
        )}
      >
        {fileChanges.length === 0 ? (
          <div className={RIGHT_SIDEBAR_EMPTY_CLASS_NAME}>
            {t(
              isCoder
                ? "rightSidebar.overview.fileChanges.emptyCoder"
                : "rightSidebar.overview.fileChanges.empty",
            )}
          </div>
        ) : (
          <Collapse
            ghost
            activeKey={Array.from(expandedFileChangeKeys)}
            className="right-sidebar-file-change-collapse"
            expandIconPosition="end"
            items={fileChanges.map((item) => {
              const itemKey = buildFileChangeKey(item.runId, item.filePath);
              const cacheKey = buildFileHistoryCacheKey(state.chatId, item);
              return {
                key: itemKey,
                onClick: () => toggleFileChange(item),
                showArrow: false,
                label: (
                  <Flex align="center" gap={10}>
                    <MaterialIcon
                      name={getFileIcon(item.filePath)}
                      className={FILE_CHANGE_ICON_CLASS_NAME}
                      aria-hidden="true"
                    />
                    <span className={FILE_CHANGE_PATH_CLASS_NAME}>
                      {displayFileName(item.filePath)}
                    </span>
                    <span className={FILE_CHANGE_RUN_CLASS_NAME}>
                      {item.runId}
                    </span>
                  </Flex>
                ),
                extra: renderFileChangeStats(
                  item.addedLines,
                  item.deletedLines,
                  {
                    animated: fileChangeAnimation.paths.has(itemKey),
                    animationKey: `${itemKey}-${fileChangeAnimation.version}`,
                  },
                ),
                children: (
                  <div onClick={(e) => e.stopPropagation()}>
                    {renderFileHistoryPanel(fileHistoryCache[cacheKey])}
                  </div>
                ),
              };
            })}
          />
        )}
      </OverviewSection>
      <OverviewSection
        title={t("rightSidebar.overview.planning.title")}
        count={planningNodes.length}
      >
        {planningNodes.length === 0 ? (
          <div className={RIGHT_SIDEBAR_EMPTY_CLASS_NAME}>
            {t("rightSidebar.overview.planning.empty")}
          </div>
        ) : (
          <ul className={PLANNING_LIST_CLASS_NAME}>
            {planningNodes.map((item) => {
              const previewText =
                item.text.length > 120
                  ? item.text.slice(0, 120) + "..."
                  : item.text;
              const tabLabel =
                item.text.length > 30
                  ? item.text.slice(0, 30) + "..."
                  : item.text;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={PLANNING_ITEM_CLASS_NAME}
                    onClick={() => handlePlanningClick(item.id, tabLabel)}
                  >
                    <MaterialIcon
                      name="assignment"
                      className={PLANNING_ITEM_ICON_CLASS_NAME}
                      aria-hidden="true"
                    />
                    <span
                      className={PLANNING_ITEM_TEXT_CLASS_NAME}
                      title={item.text.slice(0, 500)}
                    >
                      {previewText}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </OverviewSection>
      <OverviewSection
        title={t("rightSidebar.overview.artifacts.title")}
        count={artifacts.length}
      >
        {artifacts.length === 0 ? (
          <div className={RIGHT_SIDEBAR_EMPTY_CLASS_NAME}>
            {t("rightSidebar.overview.artifacts.empty")}
          </div>
        ) : (
          <ul className={ARTIFACT_DRAWER_LIST_CLASS_NAME}>
            {artifacts.map((item) => (
              <li
                key={item.artifactId}
                className={ARTIFACT_DRAWER_ITEM_CLASS_NAME}
              >
                <AttachmentCard
                  attachment={item.artifact}
                  variant="composer"
                  displayMode="file"
                  density="compact"
                  subtitle={formatAttachmentSize(item.artifact.sizeBytes)}
                  style={{ width: "100%" }}
                />
              </li>
            ))}
          </ul>
        )}
      </OverviewSection>
    </div>
  );
};

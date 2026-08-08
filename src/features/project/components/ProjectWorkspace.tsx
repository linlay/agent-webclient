import React from "react";
import { Select, Spin } from "antd";
import type { Chat } from "@/app/state/navigationTypes";
import { FileDiffView } from "@/app/layout/sidebar/right/FileDiffView";
import { AttachmentPreviewPanel } from "@/features/artifacts/components/AttachmentPreviewPanel";
import {
  getAttachmentPreviewKind,
  type AttachmentPreviewState,
} from "@/features/artifacts/lib/attachmentPreview";
import {
  getProjectChanges,
  getProjectDiff,
  getProjectTree,
  ApiError,
  type ProjectChangeItem,
  type ProjectChangeRun,
  type ProjectDiffResponse,
  type ProjectTreeEntry,
  type ProjectTreeResponse,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import type { ProjectRouteState, ProjectView } from "@/features/project/lib/projectRoute";
import {
  projectRefreshVisible,
  resolveProjectInvalidation,
} from "@/features/project/lib/projectRefresh";
import {
  closeProjectTab,
  openProjectTab,
} from "@/features/project/lib/projectTabs";

interface DirectoryState {
  loading: boolean;
  error: string;
  revision: string;
  entries: ProjectTreeEntry[];
  nextCursor: string;
}

export interface ProjectWorkspaceProps {
  agentKey: string;
  agentName?: string;
  chats?: Chat[];
  chatId?: string;
  runId?: string;
  path?: string;
  openFiles?: string[];
  view?: ProjectView;
  polling?: boolean;
  invalidationKey?: string | number;
  invalidationPaths?: string[];
  agentSelector?: React.ReactNode;
  onStateChange?: (state: ProjectRouteState) => void;
  onOpenFullPage?: (state: ProjectRouteState) => void;
}

const PAGE_LIMIT = 200;
const CHANGE_LIMIT = 1000;
const MAX_CHANGE_PAGES = 20;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function parentDirectoryPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function displayChat(chat: Chat): string {
  return String(chat.chatName || chat.chatId || "").trim();
}

function iconFor(entry: ProjectTreeEntry, _expanded: boolean): MaterialIconName {
  if (entry.kind === "directory") return "folder_open";
  if (entry.kind === "symlink") return "git_fork";
  return "description";
}

function historyBadge(change?: ProjectChangeItem): string {
  if (!change) return "";
  if (change.changeType === "added") return "A";
  if (change.changeType === "deleted") return "D";
  return "M";
}

function buildPreview(agentKey: string, path: string): AttachmentPreviewState {
  const detected = getAttachmentPreviewKind({ name: path });
  return {
    name: path.split("/").pop() || path,
    url: "",
    downloadUrl: "",
    sourcePath: path,
    kind: detected === "unsupported" ? "text" : detected,
    workspaceFile: { agentKey, path },
  };
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  agentKey,
  agentName,
  chats = [],
  chatId,
  runId,
  path,
  openFiles,
  view = "content",
  polling = false,
  invalidationKey,
  invalidationPaths = [],
  agentSelector,
  onStateChange,
  onOpenFullPage,
}) => {
  const { t } = useI18n();
  const [workspaceName, setWorkspaceName] = React.useState("");
  const [directories, setDirectories] = React.useState<Record<string, DirectoryState>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set([""]));
  const [filter, setFilter] = React.useState("");
  const [selectedPath, setSelectedPath] = React.useState(path || "");
  const [openPaths, setOpenPaths] = React.useState<string[]>(() =>
    openProjectTab(Array.from(new Set(openFiles || [])), path || ""),
  );
  const [selectedChatId, setSelectedChatId] = React.useState(chatId || chats[0]?.chatId || "");
  const [selectedRunId, setSelectedRunId] = React.useState(runId || "");
  const [activeView, setActiveView] = React.useState<ProjectView>(view);
  const [runs, setRuns] = React.useState<ProjectChangeRun[]>([]);
  const [changes, setChanges] = React.useState<ProjectChangeItem[]>([]);
  const [changesLoading, setChangesLoading] = React.useState(false);
  const [changesError, setChangesError] = React.useState("");
  const [diff, setDiff] = React.useState<ProjectDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = React.useState(false);
  const [diffError, setDiffError] = React.useState("");
  const [previewVersion, setPreviewVersion] = React.useState(0);
  const [treeWidth, setTreeWidth] = React.useState(280);
  const [mobileTreeOpen, setMobileTreeOpen] = React.useState(true);
  const requestGeneration = React.useRef(0);
  const treeControllers = React.useRef(new Map<string, AbortController>());
  const changesController = React.useRef<AbortController | null>(null);
  const directoriesRef = React.useRef<Record<string, DirectoryState>>({});
  const selectedPathRef = React.useRef(selectedPath);
  const selectedRunIdRef = React.useRef(selectedRunId);
  const activeViewRef = React.useRef(activeView);
  const openPathsRef = React.useRef(openPaths);
  const changesRevisionRef = React.useRef("");
  directoriesRef.current = directories;
  selectedPathRef.current = selectedPath;
  selectedRunIdRef.current = selectedRunId;
  activeViewRef.current = activeView;
  openPathsRef.current = openPaths;

  const emitState = React.useCallback((patch: Partial<ProjectRouteState> = {}) => {
    onStateChange?.({
      agentKey,
      chatId: selectedChatId || undefined,
      runId: selectedRunId || undefined,
      path: selectedPath || undefined,
      openFiles: openPaths.length ? openPaths : undefined,
      view: activeView,
      ...patch,
    });
  }, [activeView, agentKey, onStateChange, openPaths, selectedChatId, selectedPath, selectedRunId]);

  const loadDirectory = React.useCallback(async (
    directoryPath: string,
    options: { append?: boolean; cursor?: string; quiet?: boolean } = {},
  ): Promise<void> => {
    const generation = requestGeneration.current;
    treeControllers.current.get(directoryPath)?.abort();
    const controller = new AbortController();
    treeControllers.current.set(directoryPath, controller);
    if (!options.quiet) {
      setDirectories((current) => ({
        ...current,
        [directoryPath]: {
          loading: true,
          error: "",
          revision: current[directoryPath]?.revision || "",
          entries: current[directoryPath]?.entries || [],
          nextCursor: current[directoryPath]?.nextCursor || "",
        },
      }));
    }
    try {
      const response = await getProjectTree({
        agentKey,
        path: directoryPath || undefined,
        cursor: options.cursor || undefined,
        limit: PAGE_LIMIT,
      }, { signal: controller.signal });
      if (generation !== requestGeneration.current) return;
      const data: ProjectTreeResponse = response.data;
      const entries = Array.isArray(data.entries) ? data.entries : [];
      setWorkspaceName(data.workspaceName || agentName || agentKey);
      const previous = directoriesRef.current[directoryPath];
      if (!options.append && previous?.revision === data.revision) {
        if (previous.loading || previous.error) {
          setDirectories((current) => ({
            ...current,
            [directoryPath]: { ...current[directoryPath], loading: false, error: "" },
          }));
        }
        return;
      }
      const currentSelectedPath = selectedPathRef.current;
      if (currentSelectedPath && parentDirectoryPath(currentSelectedPath) === directoryPath) {
        const before = previous?.entries.find((entry) => entry.path === currentSelectedPath);
        const after = entries.find((entry) => entry.path === currentSelectedPath);
        if (!before || !after || before.modifiedUnixMs !== after.modifiedUnixMs || before.sizeBytes !== after.sizeBytes) {
          setPreviewVersion((current) => current + 1);
        }
      }
      setDirectories((current) => ({
        ...current,
        [directoryPath]: {
          loading: false,
          error: "",
          revision: data.revision,
          entries: options.append
            ? [...(current[directoryPath]?.entries || []), ...entries]
            : entries,
          nextCursor: data.nextCursor || "",
        },
      }));
    } catch (error) {
      if (isAbortError(error)) return;
      if (generation !== requestGeneration.current) return;
      if (options.append && error instanceof ApiError && error.status === 409) {
        void loadDirectory(directoryPath);
        return;
      }
      setDirectories((current) => ({
        ...current,
        [directoryPath]: {
          loading: false,
          error: errorMessage(error),
          revision: current[directoryPath]?.revision || "",
          entries: current[directoryPath]?.entries || [],
          nextCursor: "",
        },
      }));
    } finally {
      if (treeControllers.current.get(directoryPath) === controller) {
        treeControllers.current.delete(directoryPath);
      }
    }
  }, [agentKey, agentName]);

  const loadChanges = React.useCallback(async (quiet = false) => {
    if (!selectedChatId) {
      setRuns([]);
      setChanges([]);
      setSelectedRunId("");
      setChangesError("");
      return;
    }
    const generation = requestGeneration.current;
    changesController.current?.abort();
    const controller = new AbortController();
    changesController.current = controller;
    if (!quiet) setChangesLoading(true);
    setChangesError("");
    try {
      let cursor = "";
      let page = 0;
      let loadedRuns: ProjectChangeRun[] = [];
      const loadedItems: ProjectChangeItem[] = [];
      let loadedRevision = "";
      do {
        const response = await getProjectChanges({
          agentKey,
          chatId: selectedChatId,
          cursor: cursor || undefined,
          limit: CHANGE_LIMIT,
        }, { signal: controller.signal });
        if (generation !== requestGeneration.current) return;
        loadedRevision = response.data.revision;
        loadedRuns = Array.isArray(response.data.runs) ? response.data.runs : [];
        loadedItems.push(...(Array.isArray(response.data.items) ? response.data.items : []));
        cursor = response.data.nextCursor || "";
        page += 1;
      } while (cursor && page < MAX_CHANGE_PAGES);

      if (changesRevisionRef.current !== loadedRevision) {
        changesRevisionRef.current = loadedRevision;
        setRuns(loadedRuns);
        setChanges(loadedItems);
      }
      const preferredRun = selectedRunIdRef.current;
      const nextRun = preferredRun && loadedRuns.some((item) => item.runId === preferredRun)
        ? preferredRun
        : loadedRuns[0]?.runId || "";
      if (nextRun !== preferredRun) {
        setSelectedRunId(nextRun);
        onStateChange?.({
          agentKey,
          chatId: selectedChatId,
          runId: nextRun || undefined,
          path: selectedPathRef.current || undefined,
          openFiles: openPathsRef.current.length ? openPathsRef.current : undefined,
          view: activeViewRef.current,
        });
      }
    } catch (error) {
      if (isAbortError(error)) return;
      if (generation !== requestGeneration.current) return;
      setChangesError(errorMessage(error));
      setRuns([]);
      setChanges([]);
    } finally {
      if (changesController.current === controller) {
        changesController.current = null;
        if (generation === requestGeneration.current) setChangesLoading(false);
      }
    }
  }, [agentKey, onStateChange, selectedChatId]);

  const refreshAll = React.useCallback(() => {
    const paths = Array.from(new Set(["", ...expanded]));
    paths.forEach((directoryPath) => void loadDirectory(directoryPath, { quiet: true }));
    void loadChanges(true);
  }, [expanded, loadChanges, loadDirectory]);

  React.useEffect(() => {
    treeControllers.current.forEach((controller) => controller.abort());
    treeControllers.current.clear();
    changesController.current?.abort();
    changesController.current = null;
    requestGeneration.current += 1;
    setDirectories({});
    directoriesRef.current = {};
    changesRevisionRef.current = "";
    setExpanded(new Set([""]));
    setWorkspaceName("");
    setSelectedPath(path || "");
    setOpenPaths(openProjectTab(Array.from(new Set(openFiles || [])), path || ""));
    setSelectedChatId(chatId || chats[0]?.chatId || "");
    setSelectedRunId(runId || "");
    setActiveView(view);
    setDiff(null);
    void loadDirectory("");
    return () => {
      treeControllers.current.forEach((controller) => controller.abort());
      treeControllers.current.clear();
      changesController.current?.abort();
      changesController.current = null;
    };
  // Prop changes intentionally reset all agent-scoped state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  React.useEffect(() => {
    setSelectedChatId(chatId || chats[0]?.chatId || "");
  }, [chatId, chats]);

  React.useEffect(() => {
    setSelectedRunId(runId || "");
  }, [runId]);

  React.useEffect(() => {
    changesRevisionRef.current = "";
    setRuns([]);
    setChanges([]);
    setDiff(null);
  }, [agentKey, selectedChatId]);

  React.useEffect(() => {
    setSelectedPath(path || "");
    setOpenPaths((current) => openProjectTab(
      openFiles ? Array.from(new Set(openFiles)) : current,
      path || "",
    ));
  }, [openFiles, path]);

  React.useEffect(() => {
    setActiveView(view);
  }, [view]);

  React.useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  React.useEffect(() => {
    if (invalidationKey === undefined) return;
    const invalidation = resolveProjectInvalidation(
      invalidationPaths,
      Object.keys(directories),
      selectedPath,
    );
    invalidation.directories.forEach((directoryPath) => {
      if (directoryPath === "" || directories[directoryPath]) {
        void loadDirectory(directoryPath, { quiet: true });
      }
    });
    void loadChanges(true);
    if (invalidation.selectedChanged) setPreviewVersion((current) => current + 1);
  // invalidationKey is the event trigger; dependent callbacks must not retrigger it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidationKey]);

  React.useEffect(() => {
    if (!polling) return;
    const refreshVisible = () => {
      if (projectRefreshVisible(document.visibilityState)) refreshAll();
    };
    const interval = window.setInterval(refreshVisible, 5000);
    window.addEventListener("focus", refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [polling, refreshAll]);

  const selectedChange = React.useMemo(
    () => changes.find((item) => item.runId === selectedRunId && item.path === selectedPath),
    [changes, selectedPath, selectedRunId],
  );
  const changeByPath = React.useMemo(() => {
    const result = new Map<string, ProjectChangeItem>();
    changes.forEach((item) => {
      if (item.runId === selectedRunId) result.set(item.path, item);
    });
    return result;
  }, [changes, selectedRunId]);

  React.useEffect(() => {
    setDiff(null);
    setDiffError("");
    if (activeView !== "diff" || !selectedPath || !selectedChatId || !selectedRunId || !selectedChange) return;
    const controller = new AbortController();
    setDiffLoading(true);
    void getProjectDiff({
      agentKey,
      chatId: selectedChatId,
      runId: selectedRunId,
      path: selectedPath,
    }, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setDiff(response.data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDiffError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiffLoading(false);
      });
    return () => controller.abort();
  }, [activeView, agentKey, selectedChange, selectedChatId, selectedPath, selectedRunId]);

  const toggleDirectory = (entry: ProjectTreeEntry) => {
    if (entry.kind !== "directory" || entry.accessible === false) return;
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
    if (!expanded.has(entry.path) && !directories[entry.path]) void loadDirectory(entry.path);
  };

  const selectFile = (entry: ProjectTreeEntry) => {
    if (entry.kind === "directory") {
      toggleDirectory(entry);
      return;
    }
    if (entry.accessible === false || entry.targetKind === "directory") return;
    const nextOpenPaths = openProjectTab(openPaths, entry.path);
    setOpenPaths(nextOpenPaths);
    setSelectedPath(entry.path);
    setActiveView("content");
    emitState({ path: entry.path, openFiles: nextOpenPaths, view: "content" });
    if (window.matchMedia?.("(max-width: 760px)").matches) setMobileTreeOpen(false);
  };

  const closeFile = (closingPath: string) => {
    const next = closeProjectTab(openPaths, selectedPath, closingPath);
    setOpenPaths(next.paths);
    if (next.activePath !== selectedPath) {
      setSelectedPath(next.activePath);
      emitState({ path: next.activePath || undefined, openFiles: next.paths.length ? next.paths : undefined });
    } else {
      emitState({ openFiles: next.paths.length ? next.paths : undefined });
    }
  };

  const renderDirectory = (directoryPath: string, depth: number): React.ReactNode => {
    const directory = directories[directoryPath];
    if (!directory) return null;
    const needle = filter.trim().toLowerCase();
    const visibleEntries = directory.entries.filter((entry) =>
      !needle || entry.name.toLowerCase().includes(needle) || entry.kind === "directory",
    );
    return (
      <>
        {visibleEntries.map((entry) => {
          const isExpanded = expanded.has(entry.path);
          const change = changeByPath.get(entry.path);
          const directoryChanged = entry.kind === "directory" && Array.from(changeByPath.keys())
            .some((changedPath) => changedPath.startsWith(`${entry.path}/`));
          return (
            <React.Fragment key={entry.path}>
              <button
                type="button"
                className={`project-tree-row${selectedPath === entry.path ? " is-selected" : ""}${entry.accessible === false ? " is-disabled" : ""}`}
                style={{ paddingLeft: 8 + depth * 16 }}
                title={entry.path}
                onClick={() => selectFile(entry)}
              >
                {entry.kind === "directory" ? (
                  <MaterialIcon name={isExpanded ? "expand_more" : "chevron_right"} />
                ) : <span className="project-tree-spacer" />}
                <MaterialIcon name={iconFor(entry, isExpanded)} />
                <span className="project-tree-name">{entry.name}</span>
                {directoryChanged ? <span className="project-tree-change-dot" aria-hidden /> : null}
                {change ? (
                  <span className={`project-change-badge is-${change.changeType}`}>{historyBadge(change)}</span>
                ) : null}
              </button>
              {entry.kind === "directory" && isExpanded ? renderDirectory(entry.path, depth + 1) : null}
            </React.Fragment>
          );
        })}
        {directory.loading ? <div className="project-tree-status"><Spin size="small" /></div> : null}
        {directory.error ? <div className="project-tree-error">{directory.error}</div> : null}
        {directory.nextCursor ? (
          <UiButton
            className="project-tree-load-more"
            variant="ghost"
            size="sm"
            onClick={() => void loadDirectory(directoryPath, { append: true, cursor: directory.nextCursor })}
          >
            {t("project.action.loadMore")}
          </UiButton>
        ) : null}
      </>
    );
  };

  const runOptions = runs.map((item) => ({
    value: item.runId,
    label: `${item.runId} · ${item.fileCount}`,
  }));

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = treeWidth;
    const move = (moveEvent: PointerEvent) => setTreeWidth(Math.max(220, Math.min(520, originWidth + moveEvent.clientX - originX)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const fileTabs = (
    <div className="project-open-tabs" role="tablist" aria-label={t("project.tabs.openFiles")}>
      {openPaths.map((openPath) => {
        const name = openPath.split("/").pop() || openPath;
        const change = changeByPath.get(openPath);
        return (
          <div className={`project-open-tab${selectedPath === openPath ? " is-active" : ""}`} key={openPath} title={openPath}>
            <button
              className="project-open-tab-label"
              type="button"
              role="tab"
              aria-selected={selectedPath === openPath}
              onClick={() => {
                setSelectedPath(openPath);
                emitState({ path: openPath });
              }}
            >
              <span>{name}</span>
              {change ? (
                <span className={`project-change-badge is-${change.changeType}`}>{historyBadge(change)}</span>
              ) : null}
            </button>
            <button
              className="project-open-tab-close"
              type="button"
              aria-label={t("project.tabs.close", { name })}
              onClick={() => closeFile(openPath)}
            >
              <MaterialIcon name="close" />
            </button>
          </div>
        );
      })}
    </div>
  );

  const viewTabs = (
    <div className="project-view-tabs" role="tablist">
      {(["content", "diff"] as ProjectView[]).map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={activeView === tab}
          className={activeView === tab ? "is-active" : ""}
          key={tab}
          disabled={!selectedPath}
          onClick={() => {
            setActiveView(tab);
            emitState({ view: tab });
          }}
        >
          {t(`project.tab.${tab}`)}
        </button>
      ))}
    </div>
  );

  return (
    <section className={`project-workspace${mobileTreeOpen ? " is-tree-open" : ""}`}>
      <header className="project-toolbar">
        <UiButton
          className="project-mobile-tree-toggle"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("project.tree.toggle")}
          onClick={() => setMobileTreeOpen((current) => !current)}
        >
          <MaterialIcon name="branches" />
        </UiButton>
        <div className="project-title" title={workspaceName || agentName || agentKey}>
          <strong>{t("project.dialog.title", { name: workspaceName || agentName || agentKey })}</strong>
        </div>
        {agentSelector ? <div className="project-agent-control">{agentSelector}</div> : null}
        <Select
          className="project-context-select"
          size="small"
          value={selectedChatId || undefined}
          placeholder={t("project.context.noChat")}
          options={chats.map((chat) => ({ value: chat.chatId, label: displayChat(chat) }))}
          onChange={(nextChatId) => {
            setSelectedChatId(nextChatId);
            setSelectedRunId("");
            emitState({ chatId: nextChatId, runId: undefined });
          }}
        />
        <Select
          className="project-context-select"
          size="small"
          loading={changesLoading}
          value={selectedRunId || undefined}
          placeholder={t("project.context.noRun")}
          options={runOptions}
          onChange={(nextRunId) => {
            setSelectedRunId(nextRunId);
            emitState({ runId: nextRunId });
          }}
        />
        <span className="project-toolbar-spacer" />
        <UiButton
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("project.action.refresh")}
          title={t("project.action.refresh")}
          onClick={refreshAll}
        >
          <MaterialIcon name="refresh" />
        </UiButton>
        {onOpenFullPage ? (
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("project.action.openFullPage")}
            title={t("project.action.openFullPage")}
            onClick={() => onOpenFullPage({
              agentKey,
              chatId: selectedChatId || undefined,
              runId: selectedRunId || undefined,
              path: selectedPath || undefined,
              openFiles: openPaths.length ? openPaths : undefined,
              view: activeView,
            })}
          >
            <MaterialIcon name="open_in_new" />
          </UiButton>
        ) : null}
      </header>

      <div className="project-main">
        <aside className="project-tree-pane" style={{ width: treeWidth }}>
          <div className="project-filter">
            <MaterialIcon name="filter_list" />
            <input
              value={filter}
              placeholder={t("project.filter.placeholder")}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="project-tree-scroll">{renderDirectory("", 0)}</div>
          {changesError ? <div className="project-tree-error">{changesError}</div> : null}
        </aside>
        <div className="project-resizer" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
        <main className="project-file-pane">
          {selectedPath && activeView === "content" ? (
            <AttachmentPreviewPanel
              key={`${agentKey}:${selectedPath}:${previewVersion}`}
              preview={buildPreview(agentKey, selectedPath)}
              toolbarLeading={fileTabs}
              toolbarTrailing={viewTabs}
              showName={false}
              showSourcePath={false}
              showNote={false}
              showLineNumbers
            />
          ) : (
            <>
              <div className="project-file-header">
                {fileTabs}
                {viewTabs}
              </div>
              <div className="project-file-body">
                {!selectedPath ? (
                  <div className="project-empty">
                    <MaterialIcon name="description" />
                    {t("project.empty.selectFile")}
                  </div>
                ) : diffLoading ? (
                  <div className="project-empty"><Spin size="small" />{t("project.diff.loading")}</div>
                ) : diff ? (
                  <div className="project-diff-scroll">
                    <FileDiffView
                      filePath={diff.path}
                      original={diff.original.exists ? diff.original.content || "" : ""}
                      current={diff.current.exists ? diff.current.content || "" : ""}
                    />
                  </div>
                ) : (
                  <div className="project-empty">
                    <MaterialIcon name="sync_alt" />
                    {diffError || t("project.diff.unavailable")}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </section>
  );
};

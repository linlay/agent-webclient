import React from "react";
import { useOpenTarget } from "@/features/surfaces/openTarget";
import { useAppState } from "@/app/state/AppContext";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import { FileDiffView } from "@/features/project/components/FileDiffView";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { buildPlanSummaryView } from "@/features/plan/lib/planSummary";
import { Collapse, Flex, Typography } from "antd";
import { FileIcon } from "@/shared/components/file-icon";
import { TextCountUp } from "@/shared/components/text-count-up";
import { OverviewRunInfoSection } from "./OverviewRunInfo";
import { buildOverviewRunInfo, type OverviewRunInfo } from "@/features/overview/lib/overviewRunInfo";
import {
  buildFileChangeAnimationSignatures,
  buildFileChangeKey,
  buildFileHistoryCacheKey,
  buildOverviewArtifactItems,
  buildOverviewFileChangeItems,
  resolveAnimatedFileChangePaths,
  toggleExpandedFileChangeKey,
  type OverviewFileChangeItem,
} from "@/features/overview/lib/overviewViewModel";
import {
  useFileHistory,
  type FileHistoryCacheEntry,
} from "@/features/overview/hooks/useFileHistory";

export * from "@/features/overview/lib/overviewViewModel";
export {
  loadFileHistoryForCache,
  type FileHistoryCacheEntry,
} from "@/features/overview/hooks/useFileHistory";

const FILE_CHANGE_JUMP_DURATION_MS = 560;

const RIGHT_SIDEBAR_OVERVIEW_CLASS_NAME =
  "right-sidebar-overview tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:gap-3.5 tw:overflow-y-auto tw:pb-[20px]";

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

const FILE_CHANGE_PATH_CLASS_NAME =
  "right-sidebar-file-change-path tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:leading-[1.35] tw:text-ink-1";

const FILE_CHANGE_RUN_CLASS_NAME =
  "right-sidebar-file-change-run tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-code tw:text-[12px] tw:leading-[1.25] tw:text-ink-muted";

const FILE_CHANGE_STATS_CLASS_NAME =
  "right-sidebar-file-change-stats tw:inline-flex tw:flex-none tw:items-center tw:gap-1 tw:whitespace-nowrap tw:font-code tw:text-[11px] tw:font-bold tw:leading-[1.2]";

const FILE_CHANGE_ADD_CLASS_NAME = "right-sidebar-file-change-add tw:text-ok";

const FILE_CHANGE_DELETE_CLASS_NAME =
  "right-sidebar-file-change-delete tw:text-danger";

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
  "right-sidebar-planning-list tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-1.5 tw:px-[10px]";

const PLANNING_ITEM_CLASS_NAME =
  "right-sidebar-planning-item tw:w-full tw:flex tw:min-w-0 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_78%,white)] tw:px-2.5 tw:py-2 tw:text-left tw:text-inherit tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_38%,transparent)]";

const PLANNING_ITEM_ICON_CLASS_NAME =
  "right-sidebar-planning-item-icon tw:flex-none tw:text-base tw:text-accent-electric-strong";

const PLANNING_ITEM_TEXT_CLASS_NAME =
  "right-sidebar-planning-item-text tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[12px] tw:leading-[1.35] tw:text-ink-1";

const TASK_LIST_CLASS_NAME =
  "right-sidebar-task-list tw:m-0 tw:flex tw:list-none tw:flex-col tw:px-0";

const TASK_ITEM_CLASS_NAME =
  "right-sidebar-task-item tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-[11px] tw:leading-[1.45] tw:text-ink-2 tw:hover:bg-[var(--bg-hover)]";

const TASK_ITEM_TEXT_CLASS_NAME =
  "right-sidebar-task-item-text tw:min-w-0 tw:flex-1";

const TASK_ITEM_DURATION_CLASS_NAME =
  "right-sidebar-task-item-duration tw:flex-none tw:text-[10px] tw:text-ink-muted tw:whitespace-nowrap";

const TASK_ITEM_RUNNING_CLASS_NAME =
  "tw:bg-[color-mix(in_srgb,var(--accent-soft)_30%,transparent)]";

const ARTIFACT_DRAWER_LIST_CLASS_NAME =
  "artifact-drawer-list right-sidebar-artifact-list tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2.5 tw:overflow-visible tw:px-[10px]";

const ARTIFACT_DRAWER_ITEM_CLASS_NAME =
  "artifact-drawer-item tw:min-w-0 tw:list-none tw:[&_.attachment-card-file-shell]:flex-nowrap";

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
  if (!addedLines && !deletedLines) {
    return null;
  }
  return (
    <span key={options.animationKey} className={FILE_CHANGE_STATS_CLASS_NAME}>
      <TextCountUp className={FILE_CHANGE_ADD_CLASS_NAME} text={"+" + formatLineCount(addedLines)} />
      <TextCountUp className={FILE_CHANGE_DELETE_CLASS_NAME} text={"-" + formatLineCount(deletedLines)} />
    </span>
  );
}

function renderFileHistoryPanel(
  filePath: string,
  entry: FileHistoryCacheEntry | undefined,
  t: (key: string) => string,
) {
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
  return <FileDiffView filePath={filePath} original={entry.original} current={entry.current} />;
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

export interface OverviewContentViewProps {
  runInfo: OverviewRunInfo;
  state: Pick<
    ReturnType<typeof useAppState>,
    | "artifacts"
    | "chatId"
    | "currentChatActiveRun"
    | "fileChanges"
    | "plan"
    | "planRuntimeByTaskId"
    | "rightSidebarOpen"
    | "streaming"
    | "taskItemsById"
    | "timelineNodes"
  >;
  agentKey?: string;
  isCoder?: boolean;
  teamChat?: boolean;
}

export const OverviewContentView: React.FC<OverviewContentViewProps> = ({
  state,
  runInfo,
  agentKey = "",
  isCoder = false,
  teamChat = false,
}) => {
  const openTarget = useOpenTarget();
  const { t } = useI18n();
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
  const { cache: fileHistoryCache, load: loadFileHistory } = useFileHistory(
    state.chatId,
  );
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
  const [now, setNow] = React.useState(() => Date.now());

  const isConversationActive =
    state.streaming ||
    (Boolean(state.currentChatActiveRun?.runId) &&
      state.currentChatActiveRun?.chatId === state.chatId);

  React.useEffect(() => {
    if (!state.plan || !isConversationActive) return;
    const hasRunningTask = Array.from(state.planRuntimeByTaskId.values()).some(
      (runtime) => {
        const s = String(runtime?.status || "")
          .trim()
          .toLowerCase();
        return ["running", "in_progress", "working", "doing"].includes(s);
      },
    );
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.plan, state.planRuntimeByTaskId, isConversationActive]);

  const taskSummary = React.useMemo(
    () =>
      buildPlanSummaryView(
        state.plan,
        state.planRuntimeByTaskId,
        state.taskItemsById,
        t,
        now,
        isConversationActive,
      ),
    [state.plan, state.planRuntimeByTaskId, state.taskItemsById, now, t, isConversationActive],
  );

  const planningNodes = React.useMemo(() => {
    const nodes: { id: string; planningId: string; text: string; status: string }[] = [];
    for (const [id, node] of state.timelineNodes) {
      if (node.kind === "planning" && node.text) {
        nodes.push({ id, planningId: node.planningId || "", text: node.text, status: node.status || "" });
      }
    }
    return nodes;
  }, [state.timelineNodes]);

  const handlePlanningClick = React.useCallback(
    (planningId: string, nodeId: string, label: string) => {
      if (!planningId) return;
      openTarget({
        version: 1,
        kind: "planning",
        chatId: state.chatId,
        planningId,
        nodeId,
        label,
      });
    },
    [openTarget, state.chatId],
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

  const toggleFileChange = React.useCallback(
    (item: OverviewFileChangeItem) => {
      const itemKey = buildFileChangeKey(item.runId, item.filePath);
      const { next, expanding } = toggleExpandedFileChangeKey(
        expandedFileChangeKeys,
        itemKey,
      );
      setExpandedFileChangeKeys(next);
      if (expanding) {
        loadFileHistory(item);
      }
    },
    [expandedFileChangeKeys, loadFileHistory],
  );

  const overviewSections: {
    key: string;
    hasData: boolean;
    node: React.ReactNode;
  }[] = [
    {
      key: "fileChanges",
      hasData: fileChanges.length > 0,
      node: (
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
                    <Flex align="center" gap={6}>
                      <FileIcon filename={item.filePath} size={16} />
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
                      {renderFileHistoryPanel(item.filePath, fileHistoryCache[cacheKey], t)}
                    </div>
                  ),
                };
              })}
            />
          )}
        </OverviewSection>
      ),
    },
    {
      key: "planning",
      hasData: planningNodes.length > 0,
      node: (
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
                      disabled={!item.planningId}
                      onClick={() => handlePlanningClick(item.planningId, item.id, tabLabel)}
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
      ),
    },
    {
      key: "tasks",
      hasData: Boolean(taskSummary && taskSummary.totalTasks > 0),
      node: (
        <OverviewSection
          title={t("rightSidebar.overview.tasks.title")}
          count={
            taskSummary
              ? `${taskSummary.currentCount}/${taskSummary.totalTasks}`
              : 0
          }
        >
          {!taskSummary || taskSummary.totalTasks === 0 ? (
            <div className={RIGHT_SIDEBAR_EMPTY_CLASS_NAME}>
              {t("rightSidebar.overview.tasks.empty")}
            </div>
          ) : (
            <ul className={TASK_LIST_CLASS_NAME}>
              {taskSummary.normalizedTasks.map((task) => {
                const itemClass =
                  task.status === "running"
                    ? `${TASK_ITEM_CLASS_NAME} ${TASK_ITEM_RUNNING_CLASS_NAME}`
                    : TASK_ITEM_CLASS_NAME;
                return (
                  <li
                    key={task.taskId}
                    className={itemClass}
                    data-status={task.status}
                  >
                    <span
                      className="tool-status-dot"
                      data-tool-status={task.status}
                    />
                    <Typography.Text
                      ellipsis={{ tooltip: task.description || task.taskId }}
                      className={TASK_ITEM_TEXT_CLASS_NAME}
                    >
                      {task.description || task.taskId}
                    </Typography.Text>
                    {task.durationText ? (
                      <span className={TASK_ITEM_DURATION_CLASS_NAME}>
                        {task.durationText}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </OverviewSection>
      ),
    },
    {
      key: "artifacts",
      hasData: artifacts.length > 0,
      node: (
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
                    artifactId={item.artifactId}
                    variant="composer"
                    displayMode="file"
                    density="compact"
                    subtitle={formatAttachmentSize(item.artifact.sizeBytes)}
                    activateMode="alwaysOpen"
                    surfaceContext={{ chatId: state.chatId, agentKey, teamChat }}
                    style={{ width: "100%" }}
                  />
                </li>
              ))}
            </ul>
          )}
        </OverviewSection>
      ),
    },
  ];
  overviewSections.sort((a, b) => Number(b.hasData) - Number(a.hasData));

  return (
    <div className={RIGHT_SIDEBAR_OVERVIEW_CLASS_NAME}>
      <OverviewRunInfoSection
        key={state.chatId}
        info={runInfo}
        hasContent={overviewSections.some((section) => section.hasData)}
      />
      {overviewSections.map((section) => (
        <React.Fragment key={section.key}>{section.node}</React.Fragment>
      ))}
    </div>
  );
};

export const OverviewContent: React.FC = () => {
  const state = useAppState();
  const currentWorker = React.useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  const isCoder = React.useMemo(() => {
    if (!currentWorker || currentWorker.type !== "agent") return false;
    return String(
      (currentWorker.raw as Record<string, unknown> | null)?.["mode"] || "",
    ).toUpperCase() === "CODER";
  }, [currentWorker]);
  const currentChat = state.chats.find((chat) => chat.chatId === state.chatId);
  const runInfo = React.useMemo(() => buildOverviewRunInfo({
    ...state,
    chat: currentChat,
  }), [state, currentChat]);
  const teamChat = Boolean(
    currentChat?.owner?.kind === "orchestrated-team" ||
      String(currentChat?.teamId || "").trim(),
  );
  return (
    <OverviewContentView
      state={state}
      runInfo={runInfo}
      agentKey={currentWorker?.type === "agent" ? currentWorker.sourceId : ""}
      isCoder={isCoder}
      teamChat={teamChat}
    />
  );
};

import { AgentIcon } from "@/shared/icons/agent";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { useRunActivityTimeline } from "../hooks/useRunActivityTimeline";
import { resolveRunActivityAppearance } from "../lib/runActivityAppearance";
import { chatDetailLevel } from "@/features/chats/lib/chatDetailLevel";
import { referenceIds } from "@/shared/contracts/references";
import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import timelinePresentation from "@/features/timeline/components/TimelinePresentation.module.css";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { isAgentExecutionBlocked } from "@/features/agents/lib/agentAvailability";
import { useAgentWelcome } from "@/features/agents/hooks/useAgentWelcome";
import { AgentSwitcherPopover as TimelineAgentSwitcher } from "@/features/workers/components/AgentSwitcherPopover";
import { buildTimelineAgentOptions } from "@/features/workers/lib/agentSelection";
export { AgentSwitcherPopover as TimelineAgentSwitcher } from "@/features/workers/components/AgentSwitcherPopover";
export { buildTimelineAgentOptions, filterTimelineAgentOptions, dispatchTimelineAgentSwitch } from "@/features/workers/lib/agentSelection";
export type { TimelineAgentOption } from "@/features/workers/lib/agentSelection";
import { useConversationSurface, useConversationPresentationClock } from "@/shared/ui/ConversationSurfaceContext";
import { queryResendSnapshot, referencesForNewChat } from "../lib/queryResend";
import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import { createPortal } from "react-dom";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
import {
  useOptionalAppContext,
  useAppState,
  useAppDispatch,
} from "@/app/state/AppContext";
import { formatTimelineTime } from "@/features/timeline/components/TimelineRow";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { RunActivityPlaceholder } from "@/features/timeline/components/RunActivityPlaceholder";
import { TimelineInteractionProvider, type TimelineInteractionValue } from "@/features/timeline/components/TimelineInteractionContext";
import { registerDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { useTimelineTextSearch } from "@/features/timeline/components/TimelineTextSearchProvider";
import {
  SELECTED_TEXT_TARGET_REVEAL_EVENT,
  type SelectedTextTargetRevealDetail,
} from "@/shared/data/desktop/selectedTextLocate";
import {
  buildTimelineDisplayItems,
  nodesForDetailLevel,
  type TimelineDisplayItem,
} from "@/features/timeline/lib/timelineDisplay";
import { hasDisplayableTimelineItem } from "@/features/timeline/lib/runActivityPlaceholder";
import {
  buildNodeCollapseTargets,
  buildNodeVirtualIndexMap,
  buildTextSearchRevealKey,
} from "@/features/timeline/lib/timelineTextSearch";
import {
  clearHighlights,
  waitForCurrentThenHighlightAll,
} from "@/features/timeline/lib/timelineTextSearchDom";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import { copyText } from "@/shared/utils/copy";
import { formatResponseDuration } from "@/shared/utils/formatResponseDuration";
import { readEpochMillis } from "@/shared/utils/platformTime";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { resolvePreferredAgentKey } from "@/features/workers/lib/queryRouting";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { ToolOutputTerminal } from "@/features/terminal/components/ToolOutputTerminal";
import { useViewPreviewPublisher } from "@/features/viewers/hooks/useViewPreviewTransfer";
import { ViewEmbed } from "@/features/timeline/components/ViewEmbed";
import { MarkdownContent } from "@/features/viewers/components/MarkdownContent";
import { TimelineAttachmentView } from "@/features/timeline/components/TimelineAttachmentView";
import { useI18n } from "@/shared/i18n";
import { createRequestId } from "@/shared/data";
import { resolvePreferredRunOwner, resolveRunOwner } from "@/features/runs/lib/runOwner";
import {
  Button,
  Dropdown,
  Flex,
  Form,
  Input,
  Popover,
  Tooltip,
} from "antd";
import type { ConversationSurfaceMode } from "@/features/conversation/lib/conversationState";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { LogoLoading } from "@/shared/components/logo-loading";
import { DotLoading } from "@/shared/components/dot-loading";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import type {
  VirtuosoHandle,
  ListRange,
  StateSnapshot,
} from "react-virtuoso";
import {
  createConversationDataSignature,
  createConversationLayoutSignature,
  getConversationScrollBookmark,
  resolveConversationRestoreIndex,
  setConversationScrollBookmark,
  type ConversationScrollBookmark,
} from "@/features/timeline/lib/conversationScrollBookmark";
import {
  CONVERSATION_AT_BOTTOM_THRESHOLD_PX,
  CONVERSATION_SCROLL_BUTTON_REVEAL_DELAY_MS,
  CONVERSATION_SCROLL_SETTLE_DELAY_MS,
  isWithinConversationFollowThreshold,
  resolveConversationFollowIntent,
  shouldPinConversationToBottom,
} from "@/features/timeline/lib/conversationFollow";
import type { AgentSkill } from "@/shared/data/api/dto/agents";
import { useAgentSkillsQuery } from "@/shared/data/query/queries";
import timelineStyles from "./Timeline.module.css";
const presentationClasses = bindCssModuleClasses({ ...timelinePresentation });


const EMPTY_AGENT_SKILLS: readonly AgentSkill[] = [];

type VirtualListItem =
  | {
      kind: "query";
      key: string;
      anchorId: string;
      item: Extract<TimelineDisplayItem, { kind: "query" }>;
    }
  | {
      kind: "run";
      key: string;
      item: Extract<TimelineDisplayItem, { kind: "run" }>;
    }
  | {
      kind: "standalone";
      key: string;
      item: Extract<TimelineDisplayItem, { kind: "standalone" }>;
    };

const QUERY_ANCHOR_MIN_SCROLL_WIDTH = 960;

const TIMELINE_EMPTY_CLASS_NAME =
  "timeline-empty tw:relative tw:break-words tw:whitespace-pre-line tw:text-center tw:text-[28px] tw:font-bold tw:leading-[1.35]";
const CONVERSATION_STAGE_CLASS_NAME =
  "conversation-stage tw:relative tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:animate-fade-slide-in";
const CONVERSATION_STAGE_SCROLL_TO_BOTTOM_CLASS_NAME =
  presentationClasses("conversation-stage-scroll-to-bottom tw:rounded-full tw:pointer-events-auto");
// 按钮不能放在 Virtuoso 的 Footer 里：Footer 属于滚动内容，sticky 受虚拟列表
// 视口容器（height:100%）限制，滚动一屏后就会跟着内容走。这里把它固定在
// conversation-stage 自身的定位层里，Footer 只保留列表末尾的留白。
const CONVERSATION_STAGE_SCROLL_TO_BOTTOM_DOCK_CLASS_NAME =
  "conversation-stage-scroll-to-bottom-dock tw:pointer-events-none tw:absolute tw:inset-x-0 tw:bottom-3 tw:z-10 tw:flex tw:justify-center";
const CONVERSATION_STAGE_BOTTOM_SPACER_CLASS_NAME =
  "conversation-stage-bottom-spacer";
const CONVERSATION_TRANSITION_OVERLAY_CLASS_NAME =
  "conversation-transition-overlay tw:absolute tw:inset-0 tw:z-20 tw:grid tw:place-items-center tw:overflow-hidden tw:px-6";
const CONVERSATION_SCROLL_RESTORE_TIMEOUT_MS = 2_000;
const CONVERSATION_TRANSITION_SKELETON_CLASS_NAME =
  "conversation-transition-skeleton";
const CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME =
  "conversation-transition-skeleton-block";
const CONVERSATION_TRANSITION_SKELETON_QUERY_BLOCK_CLASS_NAME =
  "conversation-transition-skeleton-block is-query";
const CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME =
  "conversation-transition-skeleton-block is-run";
const CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME =
  "conversation-transition-skeleton-caption";
const CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME =
  "conversation-transition-skeleton-line";
const CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME =
  "conversation-transition-skeleton-line is-small";
const CONVERSATION_TRANSITION_SKELETON_QUERY_PILL_CLASS_NAME =
  "conversation-transition-skeleton-query-pill";
const CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME =
  "conversation-transition-skeleton-dot";
const CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME =
  "conversation-transition-skeleton-card";
const CONVERSATION_TRANSITION_ERROR_CLASS_NAME =
  "conversation-transition-error tw:flex tw:max-w-[420px] tw:flex-col tw:items-center tw:gap-3 tw:text-center";
const TIMELINE_STACK_CLASS_NAME =
  "timeline-stack tw:relative tw:m-auto tw:min-h-full tw:w-full tw:max-w-[800px]";
const TIMELINE_STACK_EMPTY_CLASS_NAME =
  "is-empty tw:flex tw:items-end tw:justify-center";
const TIMELINE_EMPTY_SCROLL_CLASS_NAME = [
  "messages-scroll tw:h-full tw:flex tw:flex-col tw:overflow-y-auto tw:bg-transparent tw:px-5 tw:pb-[26px] tw:pt-5",
  SCROLLBAR_THIN_CLASS_NAME,
].join(" ");
const TIMELINE_QUERY_ANCHOR_RAIL_CLASS_NAME = "timeline-query-anchor-rail";
const TIMELINE_QUERY_ANCHOR_PREVIEW_CLASS_NAME =
  "timeline-query-anchor-preview tw:max-w-[360px] tw:text-xs";
const TIMELINE_QUERY_ANCHOR_PREVIEW_QUERY_CLASS_NAME =
  "timeline-query-anchor-preview-query tw:overflow-hidden tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:2]";
const TIMELINE_QUERY_ANCHOR_PREVIEW_CONTENT_CLASS_NAME =
  "timeline-query-anchor-preview-content tw:overflow-hidden tw:text-ink-muted tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:3]";
const TIMELINE_QUERY_ANCHOR_LINE_CLASS_NAME =
  "timeline-query-anchor-line tw:relative tw:inline-flex tw:min-h-[10px] tw:w-[26px] tw:items-center tw:justify-start tw:rounded-none tw:border-0 tw:bg-transparent tw:p-0 tw:text-ink-muted tw:opacity-0 tw:shadow-none tw:hover:bg-transparent tw:hover:text-ink-2 tw:hover:shadow-none tw:hover:outline-none tw:hover:[&_.timeline-query-anchor-line-bar]:opacity-100 tw:active:transform-none";
const TIMELINE_QUERY_ANCHOR_LINE_ACTIVE_CLASS_NAME =
  "is-active tw:[.timeline-query-anchor-rail:not(:hover)_&_.timeline-query-anchor-line-bar]:opacity-100";
const TIMELINE_QUERY_ANCHOR_LINE_BAR_CLASS_NAME =
  "timeline-query-anchor-line-bar tw:block tw:h-[2px] tw:origin-left tw:bg-ink-1 tw:opacity-30 tw:transition-[width,opacity] tw:duration-100";
const TIMELINE_META_ROW_CLASS_NAME =
  "timeline-meta-row tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3";
const TIMELINE_RUN_META_CLASS_NAME =
  "timeline-run-meta tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3 tw:mt-[4px]";
const TIMELINE_META_ACTIONS_CLASS_NAME =
  "timeline-meta-actions tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1";
const TIMELINE_META_BUTTON_CLASS_NAME =
  "timeline-meta-btn ui-icon-hover-20 tw:!h-5 tw:!min-h-5 tw:!w-5 tw:!min-w-5 tw:!rounded-lg tw:!p-0 tw:text-ink-muted tw:[&_.material-icon]:text-sm tw:[&_.ui-btn-label]:inline-flex tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-1";
const TIMELINE_RUN_ACTION_BUTTON_CLASS_NAME =
  `timeline-meta-btn ui-icon-hover-20 ${timelineStyles.runActionButton}`;
const TIMELINE_META_BUTTON_DOWNVOTED_CLASS_NAME =
  "is-downvoted tw:bg-[color-mix(in_srgb,var(--accent-danger)_12%,transparent)] tw:text-[color-mix(in_srgb,var(--accent-danger)_78%,var(--ink-1))]";
const TIMELINE_ROW_TIME_CLASS_NAME =
  presentationClasses("timeline-row-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[12px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]");
const TIMELINE_RUN_INFO_CLASS_NAME =
  "timeline-run-info tw:inline-flex tw:min-w-0 tw:shrink-0 tw:items-center tw:gap-2";
const TIMELINE_RUN_TIME_CLASS_NAME =
  "timeline-run-time tw:shrink-0 tw:text-[12px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]";

// 保持列表末尾原有的留白高度，让浮动的“滚动到底部”按钮落在空白带里，
// 不遮挡最后一条消息。
const ConversationStageBottomSpacer: React.FC = () => (
  <div
    className={CONVERSATION_STAGE_BOTTOM_SPACER_CLASS_NAME}
    aria-hidden="true"
  />
);

export function shouldEnableQueryAnchors(width: number): boolean {
  return Number.isFinite(width) && width >= QUERY_ANCHOR_MIN_SCROLL_WIDTH;
}

function buildQueryAnchorId(nodeId: string): string {
  return `query-${nodeId}`;
}

function findLastRunContentText(
  item: Extract<TimelineDisplayItem, { kind: "run" }>,
): string {
  const nodes = Array.isArray(item.nodes) ? item.nodes : [];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.kind !== "content") continue;
    const text = String(node.text || "").trim();
    if (text) return text;
  }
  return "";
}

const RunElapsedTime: React.FC<{ startTimeMs: number | null }> = ({
  startTimeMs,
}) => {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startTimeMs == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startTimeMs]);

  if (startTimeMs == null)
    return <div>{t("conversationStage.scrollToBottom")}</div>;

  const duration = formatResponseDuration(Math.max(0, now - startTimeMs), t);
  return (
    <Flex vertical align="center">
      <div>{t("conversationStage.scrollToBottom")}</div>
      <div className="tw:text-xs tw:text-text-muted">
        {t("timeline.run.processed", { duration })}
      </div>
    </Flex>
  );
};

function buildVirtualItemsDataSignature(
  items: readonly VirtualListItem[],
  expandedTaskGroups: Record<string, boolean>,
  expandedRunCollapses: Record<string, boolean>,
): string {
  const itemRevisions = items.map((item) => {
    let revision = "";
    try {
      revision = JSON.stringify(item.item);
    } catch {
      revision = item.key;
    }
    return [
      item.key,
      revision,
      Boolean(expandedTaskGroups[item.key]),
      Boolean(expandedRunCollapses[item.key]),
    ];
  });
  return createConversationDataSignature([
    ...itemRevisions,
    Object.entries(expandedTaskGroups).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    Object.entries(expandedRunCollapses).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ]);
}

function readRootFontSize(): string {
  if (
    typeof document === "undefined" ||
    typeof getComputedStyle !== "function"
  ) {
    return "";
  }
  return getComputedStyle(document.documentElement).fontSize;
}

function findVisibleConversationAnchor(
  scroller: HTMLElement,
  itemKeys: readonly string[],
): { key: string; index: number; offset: number } | null {
  const viewportRect = scroller.getBoundingClientRect();
  const elements = scroller.querySelectorAll<HTMLElement>(
    "[data-conversation-item-key]",
  );
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= viewportRect.top || rect.top >= viewportRect.bottom) {
      continue;
    }
    const key = String(element.dataset.conversationItemKey || "").trim();
    const index = itemKeys.indexOf(key);
    if (key && index >= 0) {
      return { key, index, offset: rect.top - viewportRect.top };
    }
  }
  return null;
}

function findConversationItemElement(
  scroller: HTMLElement,
  itemKey: string,
): HTMLElement | null {
  const elements = scroller.querySelectorAll<HTMLElement>(
    "[data-conversation-item-key]",
  );
  for (const element of elements) {
    if (element.dataset.conversationItemKey === itemKey) return element;
  }
  return null;
}

function isConversationScrollerAtBottom(scroller: HTMLElement): boolean {
  const maximumScrollTop = Math.max(
    0,
    scroller.scrollHeight - scroller.clientHeight,
  );
  return maximumScrollTop - scroller.scrollTop <= 1;
}

function ConversationTransitionOverlay({
  busy,
  error,
  phase,
  onRetry,
  onTransitionEnd,
  retryLabel,
}: {
  busy: boolean;
  error: string;
  phase: "visible" | "exiting";
  onRetry: () => void;
  onTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => void;
  retryLabel: string;
}) {
  return (
    <div
      className={[
        CONVERSATION_TRANSITION_OVERLAY_CLASS_NAME,
        phase === "exiting" ? "is-exiting" : "is-visible",
      ].join(" ")}
      aria-busy={busy}
      data-transition-phase={phase}
      onTransitionEnd={onTransitionEnd}
      role={error ? "alert" : "status"}
    >
      {error ? (
        <div className={CONVERSATION_TRANSITION_ERROR_CLASS_NAME}>
          <MaterialIcon name="error" />
          <strong>{error}</strong>
          <UiButton size="sm" onClick={onRetry}>
            {retryLabel}
          </UiButton>
        </div>
      ) : (
        <div
          className={CONVERSATION_TRANSITION_SKELETON_CLASS_NAME}
          aria-hidden="true"
        >
          <div
            className={CONVERSATION_TRANSITION_SKELETON_QUERY_BLOCK_CLASS_NAME}
          >
            <div
              className={CONVERSATION_TRANSITION_SKELETON_QUERY_PILL_CLASS_NAME}
            />
            <div
              className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-24 tw:mr-[10px]`}
            />
          </div>
          <div className={CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME}>
            <div
              className={CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME}
            >
              <span
                className={CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME}
              />
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-20`}
              />
            </div>
          </div>
          <div
            className={CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME}
          >
            <div className={CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME}>
              <div
                className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-[38%]`}
              />
              <div
                className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-[56%]`}
              />
              <div
                className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-[48%]`}
              />
            </div>
          </div>
          <div className={CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME}>
            <div
              className={CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME}
            >
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME} dot-blue`}
              />
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-20`}
              />
            </div>
          </div>
          <div
            className={CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME}
          >
            <div
              className={`${CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME} tw:h-[70px]`}
            />
            <div
              className={`${CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME} tw:h-[70px]`}
            />
          </div>

          <div className={CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME}>
            <div
              className={CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME}
            >
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME} dot-green`}
              />
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[70%]`}
              />
            </div>
          </div>

          <div
            className={CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME}
          >
            <span
              className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[90%]`}
            />
            <span
              className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[80%]`}
            />
            <span
              className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[40%]`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ConversationStageProps {
  surfaceMode: ConversationSurfaceMode;
  deriveChatAction: {
    isDisabled: (runId: string) => boolean;
    execute: (runId: string) => Promise<void>;
  };
  onFeedback: (
    runId: string,
    downvoted: boolean,
    comment?: string,
  ) => Promise<void>;
  expectedChatId?: string;
  showEmptyState?: boolean;
  onResendInNewChat?: (message: string, snapshot?: import("../lib/queryResend").QueryResendSnapshot) => void;
}

export const ConnectedConversationStage: React.FC<ConversationStageProps> = ({
  surfaceMode,
  deriveChatAction,
  onFeedback,
  expectedChatId,
  showEmptyState = true,
  onResendInNewChat,
}) => {
  const { t } = useI18n();
  const message = useAppMessage();
  const state = useAppState();
  useViewPreviewPublisher(isDesktopAppMode() || surfaceMode === "main" ? state.chatId : "", state.timelineNodes);
  const dispatch = useAppDispatch();
  const appContext = useOptionalAppContext();
  const openTarget = useOpenTarget();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<Map<string, number>>(new Map());
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [queryAnchorsEnabled, setQueryAnchorsEnabled] = useState(false);
  const [queryAnchorRailHost, setQueryAnchorRailHost] = useState<HTMLElement | null>(null);
  const [activeQueryAnchorId, setActiveQueryAnchorId] = useState("");
  const [derivingRunId, setDerivingRunId] = useState("");
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<
    Record<string, boolean>
  >({});
  const [expandedRunCollapses, setExpandedRunCollapses] = useState<
    Record<string, boolean>
  >({});
  const [scrollToBottomVisible, setScrollToBottomVisible] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const isAtBottomRef = useRef(true);
  // 跟随意图独立于“当前是否在底部”：内容长高会让 atBottom 短暂变 false，
  // 但只有用户主动上滚才应该退出跟随。
  const followActiveRef = useRef(true);
  const lastScrollerScrollTopRef = useRef(0);
  const pinFrameRef = useRef<number | null>(null);
  const explicitScrollTimerRef = useRef<number | null>(null);
  const scrollToBottomRevealTimerRef = useRef<number | null>(null);
  const restorationReadyRef = useRef(false);
  const scrollerScrollListenerRef = useRef<(() => void) | null>(null);
  const restoringRef = useRef(false);
  const restoreTargetModeRef = useRef<"anchor" | "bottom" | null>(null);
  const restoreAtBottomObservedRef = useRef(false);
  const rangeRef = useRef<ListRange>({ startIndex: 0, endIndex: 0 });
  const saveTimerRef = useRef<number | null>(null);
  const restoredTransitionRef = useRef<{
    seq: number;
    targetChatId: string;
  } | null>(null);
  const restoreAttemptRef = useRef<{
    seq: number;
    targetChatId: string;
    startedAt: number;
  } | null>(null);
  const lastScrollRequestIdRef = useRef(
    state.conversationScrollRequest?.id || 0,
  );
  const currentWorker = resolveCurrentWorkerSummary(state);
  const mainChatRuntime = appContext
    ? resolveMainChatRuntime(
        appContext.stateRef,
        appContext.activeQuerySessionRequestIdRef,
        appContext.querySessionsRef,
      )
    : null;
  const isMainChatRunning = Boolean(mainChatRuntime?.running);

  const timelineAgentOptions = useMemo(
    () =>
      buildTimelineAgentOptions({
        agents: state.agents,
        workerRows: state.workerRows,
        currentWorker,
      }),
    [currentWorker, state.agents, state.workerRows],
  );
  const canSwitchEmptyAgent =
    currentWorker?.type === "agent" &&
    timelineAgentOptions.some(
      (option) => option.key !== currentWorker.sourceId,
    );

  const detailLevel = chatDetailLevel(state);
  const activityRunId = mainChatRuntime?.runId || state.currentChatActiveRun?.runId || state.runId;
  const activityChatId = expectedChatId || state.chatTransition?.targetChatId || state.chatId;
  const activityScopeKey = JSON.stringify([activityChatId, activityRunId]);
  const conversationRunning =
    activityChatId === state.chatId &&
    Boolean(isMainChatRunning || state.streaming || state.currentChatActiveRun);
  const rawTimelineNodes = useMemo(() => state.timelineOrder
    .map(id => state.timelineNodes.get(id))
    .filter((node): node is TimelineNode => Boolean(node)), [state.timelineOrder, state.timelineNodes]);
  const activityTimelineNodes = useRunActivityTimeline(rawTimelineNodes, {
    scopeKey: activityScopeKey,
    runId: activityRunId,
    active: conversationRunning,
    detailLevel,
    events: state.events,
  });
  const timelineEntries = useMemo(() => nodesForDetailLevel(activityTimelineNodes, detailLevel),
    [activityTimelineNodes, detailLevel]);
  const currentAgentKey =
    currentWorker?.type === "agent"
      ? String(currentWorker.sourceId || "").trim()
      : "";
  const { greeting } = useAgentWelcome(currentAgentKey, !state.chatId && showEmptyState);
  const hasSkillReferences = useMemo(
    () => timelineEntries.some((node) => referenceIds(node.references, "skill").length > 0),
    [timelineEntries],
  );
  const skillCatalogQuery = useAgentSkillsQuery(currentAgentKey, {
    enabled: Boolean(currentAgentKey && hasSkillReferences),
  });
  const activeAgentSkills =
    skillCatalogQuery.data?.skills ?? EMPTY_AGENT_SKILLS;
  const displayItems = useMemo(() => {
    return buildTimelineDisplayItems(
      timelineEntries,
      state.events,
      state.taskItemsById,
      // attach 续接观察的 run 没有 query 头，events 里也暂无终结事件；
      // 传入活跃 run 标记，避免流式期间的节点全部退化为 standalone
      { hasActiveRun: Boolean(state.currentChatActiveRun) },
    );
  }, [
    timelineEntries,
    state.events,
    state.taskItemsById,
    state.currentChatActiveRun,
  ]);

  const expandRunCollapse = useCallback((key: string) => {
    setExpandedRunCollapses((current) =>
      current[key] ? current : { ...current, [key]: true },
    );
  }, []);

  const expandTaskGroup = useCallback((key: string) => {
    setExpandedTaskGroups((current) =>
      current[key] ? current : { ...current, [key]: true },
    );
  }, []);

  const textSearch = useTimelineTextSearch();
  const refreshHighlights =
    textSearch?.refreshHighlights ?? (() => undefined);

  const nodeVirtualIndexMap = useMemo(
    () => buildNodeVirtualIndexMap(displayItems),
    [displayItems],
  );
  const collapseTargets = useMemo(
    () => buildNodeCollapseTargets(displayItems),
    [displayItems],
  );

  const revealTimelineNode = useCallback(
    (nodeId: string, behavior: "auto" | "smooth" = "smooth"): boolean => {
      const virtualIndex = nodeVirtualIndexMap.get(nodeId);
      if (virtualIndex == null) return false;
      const runKey = collapseTargets.runKeyByNodeId.get(nodeId);
      if (runKey && !expandedRunCollapses[runKey]) expandRunCollapse(runKey);
      const taskGroupKey = collapseTargets.taskGroupKeyByNodeId.get(nodeId);
      if (taskGroupKey && !expandedTaskGroups[taskGroupKey]) {
        expandTaskGroup(taskGroupKey);
      }
      virtuosoRef.current?.scrollToIndex({
        index: virtualIndex,
        behavior,
        align: "center",
      });
      return true;
    },
    [
      collapseTargets,
      expandedRunCollapses,
      expandedTaskGroups,
      expandRunCollapse,
      expandTaskGroup,
      nodeVirtualIndexMap,
    ],
  );

  /** 当前命中位置（会话 + 关键词 + 节点 + 序数）的稳定标识，只由它决定要不要滚动。 */
  const textSearchRevealKey = useMemo(() => {
    if (!textSearch || !textSearch.open || textSearch.activeIndex < 0) return "";
    return buildTextSearchRevealKey(
      state.chatId,
      textSearch.query,
      textSearch.matches.matches[textSearch.activeIndex],
    );
  }, [state.chatId, textSearch]);

  const revealedSearchKeyRef = useRef("");

  useEffect(() => {
    if (!textSearch || !textSearch.open || !textSearchRevealKey) {
      revealedSearchKeyRef.current = "";
      clearHighlights();
      return;
    }

    // 命中位置没变（只是流式更新换了 matches / searchableNodeIds 的身份）时只重建高亮：
    // 否则运行中每个 chunk 都会把视口拖回命中处，用户根本滚不到底部。
    if (revealedSearchKeyRef.current === textSearchRevealKey) {
      refreshHighlights();
      return;
    }
    revealedSearchKeyRef.current = textSearchRevealKey;

    const match = textSearch.matches.matches[textSearch.activeIndex];
    if (!match) return;

    revealTimelineNode(match.nodeId);
    waitForCurrentThenHighlightAll(
      match.nodeId,
      textSearch.query,
      textSearch.searchableNodeIds,
      match.nodeId,
      match.ordinalInNode,
    );
  }, [
    refreshHighlights,
    revealTimelineNode,
    state.chatId,
    textSearch,
    textSearchRevealKey,
  ]);

  useEffect(() => {
    const reveal = (event: Event) => {
      const detail = (event as CustomEvent<SelectedTextTargetRevealDetail>)
        .detail;
      if (!detail || detail.handled) return;
      if (revealTimelineNode(detail.nodeId, "auto")) detail.handled = true;
    };
    window.addEventListener(SELECTED_TEXT_TARGET_REVEAL_EVENT, reveal);
    return () =>
      window.removeEventListener(SELECTED_TEXT_TARGET_REVEAL_EVENT, reveal);
  }, [revealTimelineNode]);

  const runStartedAt = useMemo(() => {
    if (!isMainChatRunning && !state.streaming) return null;
    const lastQuery = displayItems?.findLast((event) => event.kind === "query");
    if (!lastQuery) return null;
    const timestamp = lastQuery.node.ts;
    if (timestamp) return readEpochMillis(timestamp) ?? null;
    return null;
  }, [isMainChatRunning, state.streaming, displayItems]);

  const queryAnchorItems = useMemo(() => {
    const anchors: Array<{
      key: string;
      anchorId: string;
      queryText: string;
      lastRunContent: string;
    }> = [];
    for (let index = 0; index < displayItems.length; index += 1) {
      const item = displayItems[index];
      if (item.kind !== "query") continue;

      const nextItem = displayItems[index + 1];
      anchors.push({
        key: item.key,
        anchorId: buildQueryAnchorId(item.node.id),
        queryText:
          String(item.node.text || "").trim() || t("timeline.query.noText"),
        lastRunContent:
          nextItem?.kind === "run" ? findLastRunContentText(nextItem) : "",
      });
    }
    return anchors;
  }, [displayItems, t]);

  const virtualItems = useMemo((): VirtualListItem[] => {
    return displayItems.map((item) => {
      if (item.kind === "query") {
        return {
          kind: "query",
          key: item.key,
          anchorId: buildQueryAnchorId(item.node.id),
          item,
        };
      }
      if (item.kind === "run") {
        return { kind: "run", key: item.key, item };
      }
      return { kind: "standalone", key: item.key, item };
    });
  }, [displayItems]);
  const hasDisplayableNode = useMemo(
    () => hasDisplayableTimelineItem(displayItems),
    [displayItems],
  );
  // Query 行只是会话上下文，不算可展示输出；只有它时仍用进度行过渡。
  const showActivityPlaceholder = conversationRunning && !hasDisplayableNode;
  // Keep one component identity while the copy rotates: a new type each render
  // would remount the placeholder and restart its rotation on every stream tick.
  const stageFooter = useMemo(() => {
    if (!showActivityPlaceholder) return ConversationStageBottomSpacer;
    const padding = virtualItems.length === 0 ? "tw:pt-5" : "tw:pt-1";
    const StageFooter: React.FC<{ context: unknown }> = () => (
      <>
        <div className={padding}>
          <RunActivityPlaceholder active scopeKey={activityScopeKey} />
        </div>
        <ConversationStageBottomSpacer />
      </>
    );
    return StageFooter;
  }, [activityScopeKey, showActivityPlaceholder, virtualItems.length]);

  const virtualItemKeys = useMemo(
    () => virtualItems.map((item) => item.key),
    [virtualItems],
  );
  const dataSignature = useMemo(
    () =>
      buildVirtualItemsDataSignature(
        virtualItems,
        expandedTaskGroups,
        expandedRunCollapses,
      ),
    [expandedRunCollapses, expandedTaskGroups, virtualItems],
  );
  const layoutSignature = useMemo(
    () =>
      createConversationLayoutSignature({
        surfaceMode,
        containerWidth,
        themeMode: state.themeMode,
        rootFontSize: readRootFontSize(),
      }),
    [containerWidth, state.themeMode, surfaceMode],
  );
  const currentBookmark = useMemo(
    () =>
      state.chatId
        ? getConversationScrollBookmark({ surfaceMode, chatId: state.chatId })
        : null,
    [dataSignature, layoutSignature, state.chatId, surfaceMode],
  );
  // 组件重新挂载（例如切换 Surface）时 transition 可能早已 ready，恢复流程不会再跑。
  // 等容器量出真实宽度后再按已保存书签决定是否跟随，避免图片等晚到布局
  // 把中部阅读位置拽回底部。
  const initialFollowResolvedRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (initialFollowResolvedRef.current) return;
    if (containerWidth <= 0) return;
    initialFollowResolvedRef.current = true;
    if (!currentBookmark) return;
    const bookmarkMatchesTimeline =
      currentBookmark.dataSignature === dataSignature &&
      currentBookmark.layoutSignature === layoutSignature;
    followActiveRef.current = bookmarkMatchesTimeline
      ? currentBookmark.atBottom
      : true;
  }, [containerWidth]);
  const transition = state.chatTransition;
  const sharedPresentation = useConversationSurface();
  // Local fallback for independently mounted timelines; shells share one clock.
  const targetChatId =
    expectedChatId || transition?.targetChatId || state.chatId;
  const matchingTransition =
    transition?.targetChatId === targetChatId ? transition : null;
  const mismatch = Boolean(targetChatId && targetChatId !== state.chatId);
  const background =
    !mismatch && matchingTransition?.displayMode === "background";
  const localPresentation = useConversationPresentationClock(
    {
      targetChatId,
      identity: `${targetChatId}:${matchingTransition?.seq || "route"}`,
      pending:
        mismatch ||
        (!background &&
          Boolean(
            matchingTransition &&
            ["loading", "applying", "restoring"].includes(
              matchingTransition.phase,
            ),
          )),
      error:
        matchingTransition?.phase === "error" ? matchingTransition.error : "",
      background,
    },
    !sharedPresentation,
  );
  const presentation = sharedPresentation || localPresentation;
  const restorationReady = presentation.restorationReady;
  restorationReadyRef.current = restorationReady;
  const matchingSnapshot = Boolean(
    currentBookmark?.snapshot &&
    currentBookmark.dataSignature === dataSignature &&
    currentBookmark.layoutSignature === layoutSignature,
  )
    ? currentBookmark?.snapshot
    : undefined;
  const virtuosoInstanceKey = `${surfaceMode}:${state.chatId}:${
    transition?.kind === "same-chat-reload" &&
    transition.targetChatId === state.chatId
      ? transition.seq
      : 0
  }`;

  const flashActionStatus = useCallback((key: string, text: string) => {
    const existing = statusTimerRef.current.get(key);
    if (existing) {
      window.clearTimeout(existing);
    }
    setActionStatus((current) => ({ ...current, [key]: text }));
    const timer = window.setTimeout(() => {
      setActionStatus((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      statusTimerRef.current.delete(key);
    }, 1600);
    statusTimerRef.current.set(key, timer);
  }, []);

  const handleCopy = useCallback(
    async (key: string, text: string) => {
      try {
        await copyText(text);
        flashActionStatus(key, t("timeline.toolPill.copy.copied"));
        message.success(t("timeline.toolPill.copy.copied"));
      } catch {
        flashActionStatus(key, t("timeline.toolPill.copy.failed"));
        message.error(t("timeline.toolPill.copy.failed"));
      }
    },
    [flashActionStatus, message, t],
  );

  const agentExecutionBlocked = isAgentExecutionBlocked(state);

  const handleResend = useCallback(
    (text: string, snapshot: import("../lib/queryResend").QueryResendSnapshot) => {
      if (agentExecutionBlocked || isMainChatRunning || !text.trim()) return;
      window.dispatchEvent(
        new CustomEvent("agent:send-message", { detail: { message: text, ...snapshot } }),
      );
    },
    [agentExecutionBlocked, isMainChatRunning],
  );

  const handleResendInNewChat = useCallback(
    (text: string, snapshot: import("../lib/queryResend").QueryResendSnapshot) => {
      const messageText = text.trim();
      if (agentExecutionBlocked || isMainChatRunning || !messageText) return;
      if (onResendInNewChat) {
        onResendInNewChat(messageText, snapshot);
        return;
      }

      const workerDetail: Record<string, string | boolean> = {
        preserveWorkerContext: true,
        focusComposerOnComplete: false,
      };
      const sendDetail: Record<string, unknown> = { message: messageText, references: referencesForNewChat(snapshot.references,state.chatId) };
      if (currentWorker?.type === "agent" && currentWorker.sourceId) {
        workerDetail.agentKey = currentWorker.sourceId;
        sendDetail.agentKey = currentWorker.sourceId;
      }

      window.dispatchEvent(
        new CustomEvent("agent:start-new-conversation", {
          detail: workerDetail,
        }),
      );
      window.dispatchEvent(
        new CustomEvent("agent:send-message", { detail: sendDetail }),
      );
    },
    [agentExecutionBlocked, currentWorker, isMainChatRunning, onResendInNewChat],
  );

  const handleDeriveChat = useCallback(
    async (runId: string) => {
      if (deriveChatAction.isDisabled(runId)) return;

      setDerivingRunId(runId);
      try {
        await deriveChatAction.execute(runId);
      } finally {
        setDerivingRunId((current) => (current === runId ? "" : current));
      }
    },
    [deriveChatAction],
  );

  const toggleTaskGroup = useCallback((key: string) => {
    setExpandedTaskGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const toggleRunCollapse = useCallback((key: string) => {
    setExpandedRunCollapses((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const captureCurrentBookmark = useCallback(() => {
    const chatId = String(state.chatId || "").trim();
    if (!chatId || restoringRef.current) return;
    const fallbackIndex = Math.max(
      0,
      Math.min(virtualItemKeys.length - 1, rangeRef.current.startIndex || 0),
    );
    const visibleAnchor = scrollerRef.current
      ? findVisibleConversationAnchor(scrollerRef.current, virtualItemKeys)
      : null;
    const anchorIndex = visibleAnchor?.index ?? fallbackIndex;
    const anchorItemKey =
      visibleAnchor?.key || virtualItemKeys[anchorIndex] || null;
    const bookmarkBase: ConversationScrollBookmark = {
      anchorItemKey,
      anchorIndex,
      previousItemKey:
        anchorIndex > 0 ? virtualItemKeys[anchorIndex - 1] || null : null,
      nextItemKey: virtualItemKeys[anchorIndex + 1] || null,
      anchorOffset: visibleAnchor?.offset || 0,
      atBottom: isAtBottomRef.current,
      dataSignature,
      layoutSignature,
      savedAt: Date.now(),
    };
    const commit = (snapshot?: StateSnapshot) => {
      setConversationScrollBookmark(
        { surfaceMode, chatId },
        { ...bookmarkBase, ...(snapshot ? { snapshot } : {}) },
      );
    };
    if (virtuosoRef.current) {
      virtuosoRef.current.getState((snapshot) => commit(snapshot));
    } else {
      commit();
    }
  }, [
    dataSignature,
    layoutSignature,
    state.chatId,
    surfaceMode,
    virtualItemKeys,
  ]);

  const captureCurrentBookmarkRef = useRef(captureCurrentBookmark);
  captureCurrentBookmarkRef.current = captureCurrentBookmark;

  useIsomorphicLayoutEffect(() => {
    const viewportHandle = appContext?.conversationViewportRef;
    if (!viewportHandle) return;
    const handle = {
      captureCurrent: () => captureCurrentBookmarkRef.current(),
    };
    viewportHandle.current = handle;
    return () => {
      captureCurrentBookmarkRef.current();
      if (viewportHandle.current === handle) {
        viewportHandle.current = null;
      }
    };
  }, [appContext?.conversationViewportRef]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        captureCurrentBookmarkRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const clearScrollToBottomRevealTimer = useCallback(() => {
    if (scrollToBottomRevealTimerRef.current !== null) {
      window.clearTimeout(scrollToBottomRevealTimerRef.current);
      scrollToBottomRevealTimerRef.current = null;
    }
  }, []);

  const hideScrollToBottom = useCallback(() => {
    clearScrollToBottomRevealTimer();
    setScrollToBottomVisible(false);
  }, [clearScrollToBottomRevealTimer]);

  const showScrollToBottom = useCallback(() => {
    clearScrollToBottomRevealTimer();
    setScrollToBottomVisible(true);
  }, [clearScrollToBottomRevealTimer]);

  // 生长把内容顶出视口时先给贴底一帧机会；只有缺口真的留在那里才亮按钮。
  const revealScrollToBottomLater = useCallback(() => {
    if (scrollToBottomRevealTimerRef.current !== null) return;
    scrollToBottomRevealTimerRef.current = window.setTimeout(() => {
      scrollToBottomRevealTimerRef.current = null;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      // 以真实滚动位置为准：期间可能已经贴底，只是 atBottom 回调还没回来。
      if (
        isWithinConversationFollowThreshold({
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          scrollTop: scroller.scrollTop,
        })
      ) {
        return;
      }
      setScrollToBottomVisible(true);
    }, CONVERSATION_SCROLL_BUTTON_REVEAL_DELAY_MS);
  }, []);

  const trackScrollerScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const scrollTop = scroller.scrollTop;
    const previousScrollTop = lastScrollerScrollTopRef.current;
    lastScrollerScrollTopRef.current = scrollTop;
    if (restoringRef.current) return;
    const atBottom = isWithinConversationFollowThreshold({
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      scrollTop,
    });
    followActiveRef.current = resolveConversationFollowIntent({
      following: followActiveRef.current,
      atBottom,
      scrollTop,
      previousScrollTop,
    });
    if (atBottom) {
      hideScrollToBottom();
    } else if (!followActiveRef.current) {
      // 用户已经主动停在非底部位置：立即给按钮反馈，不走防抖。
      showScrollToBottom();
    }
  }, [hideScrollToBottom, showScrollToBottom]);
  const trackScrollerScrollRef = useRef(trackScrollerScroll);
  trackScrollerScrollRef.current = trackScrollerScroll;

  const handleScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      const element = ref instanceof HTMLElement ? ref : null;
      if (scrollerRef.current === element) return;
      if (scrollerRef.current && scrollerScrollListenerRef.current) {
        scrollerRef.current.removeEventListener(
          "scroll",
          scrollerScrollListenerRef.current,
        );
      }
      scrollerRef.current = element;
      scrollerScrollListenerRef.current = null;
      if (!element) return;
      lastScrollerScrollTopRef.current = element.scrollTop;
      const listener = () => trackScrollerScrollRef.current();
      scrollerScrollListenerRef.current = listener;
      element.addEventListener("scroll", listener, { passive: true });
    },
    [],
  );

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    if (scrolling) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }
    if (restoringRef.current) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      captureCurrentBookmarkRef.current();
    }, 150);
  }, []);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    if (restoringRef.current) {
      if (restoreTargetModeRef.current === "bottom") {
        restoreAtBottomObservedRef.current = atBottom;
      }
      return;
    }
    // 不在底部时不直接关跟随：高度增长、视口变矮也会让 atBottom 变 false，
    // 只有真实的向上滚动（scroll 事件）才算用户离开底部。
    if (atBottom) followActiveRef.current = true;
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      hideScrollToBottom();
    } else {
      // 内容生长会在下一帧被贴底修复；先不亮按钮，避免每个 chunk 闪一下。
      revealScrollToBottomLater();
    }
  }, [hideScrollToBottom, revealScrollToBottomLater]);

  const pinConversationToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      align: "end",
      behavior: "auto",
    });
  }, []);

  // followOutput 只对条目数量变化求值；流式回答是最后一条自己长高，
  // 必须由总高度变化补一次贴底，否则缺口会一直累积。
  const handleTotalListHeightChanged = useCallback(() => {
    if (pinFrameRef.current !== null) return;
    if (
      !shouldPinConversationToBottom({
        following: followActiveRef.current,
        restorationReady: restorationReadyRef.current,
        restoring: restoringRef.current,
      })
    ) {
      return;
    }
    pinFrameRef.current = window.requestAnimationFrame(() => {
      pinFrameRef.current = null;
      if (
        !shouldPinConversationToBottom({
          following: followActiveRef.current,
          restorationReady: restorationReadyRef.current,
          restoring: restoringRef.current,
        })
      ) {
        return;
      }
      pinConversationToBottom();
    });
  }, [pinConversationToBottom]);

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      rangeRef.current = range;
      refreshHighlights();
      if (!queryAnchorsEnabled) return;
      let activeAnchorId = "";
      for (let i = range.startIndex; i >= 0; i--) {
        const item = virtualItems[i];
        if (item?.kind === "query") {
          activeAnchorId = item.anchorId;
          break;
        }
      }
      setActiveQueryAnchorId((current) =>
        current === activeAnchorId ? current : activeAnchorId,
      );
    },
    [queryAnchorsEnabled, refreshHighlights, virtualItems],
  );

  const handleQueryAnchorClick = useCallback(
    (anchorId: string) => {
      const normalizedAnchorId = String(anchorId || "").trim();
      if (!normalizedAnchorId) return;
      const index = virtualItems.findIndex(
        (item) => item.kind === "query" && item.anchorId === normalizedAnchorId,
      );
      if (index >= 0 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index,
          behavior: "smooth",
          align: "start",
        });
        setActiveQueryAnchorId(normalizedAnchorId);
      }
    },
    [virtualItems],
  );

  const handleScrollToBottomClick = () => {
    dispatch({
      type: "REQUEST_CONVERSATION_SCROLL",
      chatId: state.chatId,
      reason: "user-click",
    });
  };

  useEffect(() => {
    const request = state.conversationScrollRequest;
    if (!request || request.id <= lastScrollRequestIdRef.current) return;
    lastScrollRequestIdRef.current = request.id;
    if (
      request.target !== "bottom" ||
      request.chatId !== state.chatId ||
      !restorationReady
    ) {
      return;
    }
    followActiveRef.current = true;
    isAtBottomRef.current = true;
    hideScrollToBottom();
    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      behavior: "smooth",
      align: "end",
    });
    // 平滑滚动只算一次目标：内容在动画期间继续变高就会停在半路。
    // 动画结束后用 auto 校正一次；后续生长由 totalListHeightChanged 接管。
    if (explicitScrollTimerRef.current !== null) {
      window.clearTimeout(explicitScrollTimerRef.current);
    }
    explicitScrollTimerRef.current = window.setTimeout(() => {
      explicitScrollTimerRef.current = null;
      if (!followActiveRef.current) return;
      const scroller = scrollerRef.current;
      if (!scroller || isConversationScrollerAtBottom(scroller)) return;
      pinConversationToBottom();
    }, CONVERSATION_SCROLL_SETTLE_DELAY_MS);
  }, [
    hideScrollToBottom,
    pinConversationToBottom,
    restorationReady,
    state.chatId,
    state.conversationScrollRequest,
  ]);

  useIsomorphicLayoutEffect(() => {
    if (
      !transition ||
      transition.phase !== "applying" ||
      transition.targetChatId !== state.chatId
    ) {
      return;
    }
    dispatch({
      type: "ADVANCE_CHAT_TRANSITION",
      seq: transition.seq,
      targetChatId: transition.targetChatId,
      phase: "restoring",
    });
  }, [dispatch, state.chatId, transition]);

  useIsomorphicLayoutEffect(() => {
    if (
      !transition ||
      transition.phase !== "restoring" ||
      transition.targetChatId !== state.chatId ||
      (restoredTransitionRef.current?.seq === transition.seq &&
        restoredTransitionRef.current.targetChatId === transition.targetChatId)
    ) {
      return;
    }

    restoringRef.current = true;
    const existingAttempt = restoreAttemptRef.current;
    const restoreAttempt =
      existingAttempt?.seq === transition.seq &&
      existingAttempt.targetChatId === transition.targetChatId
        ? existingAttempt
        : {
            seq: transition.seq,
            targetChatId: transition.targetChatId,
            startedAt: Date.now(),
          };
    restoreAttemptRef.current = restoreAttempt;
    const bookmark = currentBookmark;
    const bookmarkMatchesCurrentTimeline = Boolean(
      bookmark &&
      bookmark.dataSignature === dataSignature &&
      bookmark.layoutSignature === layoutSignature,
    );
    const restorableBookmark = bookmarkMatchesCurrentTimeline ? bookmark : null;
    const resolvedBookmarkIndex =
      restorableBookmark && !restorableBookmark.atBottom
        ? resolveConversationRestoreIndex(restorableBookmark, virtualItemKeys)
        : -1;
    const shouldRestoreBottom = Boolean(
      !restorableBookmark ||
      restorableBookmark.atBottom ||
      resolvedBookmarkIndex < 0,
    );
    isAtBottomRef.current = shouldRestoreBottom;
    if (shouldRestoreBottom) {
      hideScrollToBottom();
    } else {
      showScrollToBottom();
    }
    followActiveRef.current = shouldRestoreBottom;
    restoreTargetModeRef.current = shouldRestoreBottom ? "bottom" : "anchor";
    restoreAtBottomObservedRef.current = false;
    let cancelled = false;
    let frameId = 0;
    let stableFrameCount = 0;
    let issuedIndexScroll = false;
    const targetIndex = shouldRestoreBottom
      ? virtualItemKeys.length - 1
      : resolvedBookmarkIndex;
    const targetItemKey = targetIndex >= 0 ? virtualItemKeys[targetIndex] : "";
    const restoreStartedAt = restoreAttempt.startedAt;
    const fallbackReason = !bookmark
      ? "missing-bookmark"
      : !bookmarkMatchesCurrentTimeline
        ? "signature-mismatch"
        : !bookmark.atBottom && resolvedBookmarkIndex < 0
          ? "unresolved-anchor"
          : "";
    dispatch({
      type: "APPEND_DEBUG",
      line: `[chat-scroll-restore-start] chatId=${transition.targetChatId} transitionSeq=${transition.seq} mode=${shouldRestoreBottom ? "bottom" : "anchor"} targetIndex=${targetIndex} targetKey=${targetItemKey || "none"} targetOffset=${restorableBookmark?.anchorOffset || 0}`,
    });
    if (fallbackReason) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[chat-scroll-restore-fallback-bottom] chatId=${transition.targetChatId} transitionSeq=${transition.seq} reason=${fallbackReason}`,
      });
    }

    const isStillCurrent = () => {
      const latest = appContext?.stateRef.current.chatTransition;
      return Boolean(
        latest &&
        latest.seq === transition.seq &&
        latest.targetChatId === transition.targetChatId &&
        latest.phase === "restoring",
      );
    };
    if (!isStillCurrent()) {
      restoringRef.current = false;
      restoreTargetModeRef.current = null;
      restoreAtBottomObservedRef.current = false;
      return;
    }
    let timeoutId: number | null = null;
    let completed = false;
    const finish = (reason: "empty" | "stable" | "timeout") => {
      if (cancelled || completed || !isStillCurrent()) return;
      completed = true;
      restoredTransitionRef.current = {
        seq: transition.seq,
        targetChatId: transition.targetChatId,
      };
      if (
        restoreAttemptRef.current?.seq === transition.seq &&
        restoreAttemptRef.current.targetChatId === transition.targetChatId
      ) {
        restoreAttemptRef.current = null;
      }
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      restoringRef.current = false;
      restoreTargetModeRef.current = null;
      restoreAtBottomObservedRef.current = false;
      followActiveRef.current = shouldRestoreBottom;
      const scroller = scrollerRef.current;
      lastScrollerScrollTopRef.current =
        scroller?.scrollTop ?? lastScrollerScrollTopRef.current;
      const elapsedMs = Math.max(0, Date.now() - restoreStartedAt);
      if (reason === "timeout") {
        const scrollTop = scroller?.scrollTop || 0;
        const remainingErrorPx =
          shouldRestoreBottom && scroller
            ? Math.max(
                0,
                scroller.scrollHeight - scroller.clientHeight - scrollTop,
              )
            : (() => {
                const element =
                  targetItemKey && scroller
                    ? findConversationItemElement(scroller, targetItemKey)
                    : null;
                if (!element || !scroller) return "unknown";
                return Math.abs(
                  element.getBoundingClientRect().top -
                    scroller.getBoundingClientRect().top -
                    (restorableBookmark?.anchorOffset || 0),
                );
              })();
        dispatch({
          type: "APPEND_DEBUG",
          line: `[chat-scroll-restore-timeout] chatId=${transition.targetChatId} transitionSeq=${transition.seq} mode=${shouldRestoreBottom ? "bottom" : "anchor"} targetIndex=${targetIndex} targetKey=${targetItemKey || "none"} scrollTop=${scrollTop} remainingErrorPx=${remainingErrorPx} elapsedMs=${elapsedMs}`,
        });
      }
      dispatch({
        type: "APPEND_DEBUG",
        line: `[chat-scroll-restore-ready] chatId=${transition.targetChatId} transitionSeq=${transition.seq} mode=${shouldRestoreBottom ? "bottom" : "anchor"} targetIndex=${targetIndex} targetKey=${targetItemKey || "none"} targetOffset=${restorableBookmark?.anchorOffset || 0} scrollTop=${scroller?.scrollTop || 0} elapsedMs=${elapsedMs}`,
      });
      dispatch({
        type: "ADVANCE_CHAT_TRANSITION",
        seq: transition.seq,
        targetChatId: transition.targetChatId,
        phase: "ready",
      });
      if (transition.focusComposerOnReady) {
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("agent:focus-composer"));
        });
      }
    };
    const settle = () => {
      if (cancelled || !isStillCurrent()) return;
      if (virtualItemKeys.length === 0) {
        finish("empty");
        return;
      }
      if (shouldRestoreBottom) {
        if (!issuedIndexScroll) {
          issuedIndexScroll = true;
          virtuosoRef.current?.scrollToIndex({
            index: "LAST",
            behavior: "auto",
            align: "end",
          });
        }
        const scroller = scrollerRef.current;
        const bottomReached =
          restoreAtBottomObservedRef.current ||
          Boolean(scroller && isConversationScrollerAtBottom(scroller));
        stableFrameCount = bottomReached ? stableFrameCount + 1 : 0;
      } else {
        const scroller = scrollerRef.current;
        const element =
          targetItemKey && scroller
            ? findConversationItemElement(scroller, targetItemKey)
            : null;
        if (!element || !scroller) {
          if (!issuedIndexScroll && targetIndex >= 0) {
            issuedIndexScroll = true;
            virtuosoRef.current?.scrollToIndex({
              index: targetIndex,
              behavior: "auto",
              align: "start",
            });
          }
          stableFrameCount = 0;
        } else {
          const delta =
            element.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top -
            (restorableBookmark?.anchorOffset || 0);
          if (Math.abs(delta) <= 1) {
            stableFrameCount += 1;
          } else {
            stableFrameCount = 0;
            virtuosoRef.current?.scrollBy({
              top: delta,
              behavior: "auto",
            });
          }
        }
      }
      if (stableFrameCount >= 2) {
        finish("stable");
        return;
      }
      frameId = window.requestAnimationFrame(settle);
    };

    if (!shouldRestoreBottom && !matchingSnapshot && targetIndex >= 0) {
      issuedIndexScroll = true;
      virtuosoRef.current?.scrollToIndex({
        index: targetIndex,
        behavior: "auto",
        align: "start",
      });
    }
    const timeoutDelayMs = Math.max(
      0,
      CONVERSATION_SCROLL_RESTORE_TIMEOUT_MS -
        Math.max(0, Date.now() - restoreStartedAt),
    );
    timeoutId = window.setTimeout(() => finish("timeout"), timeoutDelayMs);
    frameId = window.requestAnimationFrame(settle);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      restoringRef.current = false;
      restoreTargetModeRef.current = null;
      restoreAtBottomObservedRef.current = false;
    };
  }, [
    appContext?.stateRef,
    currentBookmark,
    dataSignature,
    dispatch,
    layoutSignature,
    matchingSnapshot,
    state.chatId,
    transition,
    virtualItemKeys,
  ]);

  useEffect(() => {
    return () => {
      statusTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      statusTimerRef.current.clear();
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (pinFrameRef.current !== null) {
        window.cancelAnimationFrame(pinFrameRef.current);
        pinFrameRef.current = null;
      }
      if (explicitScrollTimerRef.current !== null) {
        window.clearTimeout(explicitScrollTimerRef.current);
        explicitScrollTimerRef.current = null;
      }
      if (scrollToBottomRevealTimerRef.current !== null) {
        window.clearTimeout(scrollToBottomRevealTimerRef.current);
        scrollToBottomRevealTimerRef.current = null;
      }
      if (scrollerRef.current && scrollerScrollListenerRef.current) {
        scrollerRef.current.removeEventListener(
          "scroll",
          scrollerScrollListenerRef.current,
        );
        scrollerScrollListenerRef.current = null;
      }
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!(parent instanceof HTMLElement)) {
      setQueryAnchorRailHost(null);
      return;
    }
    setQueryAnchorRailHost(
      parent.classList.contains("app-shell-center") ||
        parent.classList.contains("app-shell")
        ? parent
        : null,
    );
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidthState = (width = el.clientWidth) => {
      setContainerWidth(width);
      setQueryAnchorsEnabled(shouldEnableQueryAnchors(width));
    };

    updateWidthState();
    if (typeof ResizeObserver === "undefined") {
      if (typeof window === "undefined") return;
      const handleResize = () => updateWidthState();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver(() => {
      updateWidthState(el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const currentAgent = state.agents.find(agent => agent.key === currentWorker?.sourceId);
  const emptyAgentIdentity = (
    <span className="timeline-empty-agent-identity tw:inline-flex tw:items-baseline tw:gap-2 tw:align-baseline">
      {canSwitchEmptyAgent ? (
        <TimelineAgentSwitcher currentWorker={currentWorker} options={timelineAgentOptions} />
      ) : <span>{currentWorker?.displayName}</span>}
      <span data-agent-identity="" className="timeline-empty-agent-icon tw:me-2 tw:inline-flex tw:self-center">
        <AgentIcon type="agent" icon={currentAgent?.icon} mode={currentAgent?.mode} props={{ icon: { width: 40, height: 40 } }} />
      </span>
    </span>
  );
  const emptyStateContent = !state.chatId && showEmptyState && (
    <div className={TIMELINE_EMPTY_CLASS_NAME}>
      {greeting ? greeting.split("${agent}").map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && emptyAgentIdentity}
          {part}
        </React.Fragment>
      )) : currentWorker?.displayName ? (
        <>
          {t("timeline.empty.withAgentPrefix")}
          {emptyAgentIdentity}
          {t("timeline.empty.withAgentSuffix")}
        </>
      ) : t("timeline.empty.default")}
    </div>
  );

  const scrollToBottomRunning = isMainChatRunning || state.streaming;
  const showScrollToBottomControl = Boolean(state.chatId) && scrollToBottomVisible;

  const renderScrollToBottomControl = () => {
    // 已在底部时不展示：内容还在视口里时这个按钮没有意义。
    if (!showScrollToBottomControl) {
      return null;
    }
    return (
      <div className={CONVERSATION_STAGE_SCROLL_TO_BOTTOM_DOCK_CLASS_NAME}>
        <Tooltip
          title={
            scrollToBottomRunning ? (
              <RunElapsedTime startTimeMs={runStartedAt} />
            ) : (
              t("conversationStage.scrollToBottom")
            )
          }
          placement="top"
        >
          <UiButton
            className={CONVERSATION_STAGE_SCROLL_TO_BOTTOM_CLASS_NAME}
            iconOnly
            size="sm"
            onClick={handleScrollToBottomClick}
          >
            {scrollToBottomRunning ? (
              <DotLoading
                color="primary"
                height={15}
                ariaLabel={t("leftSidebar.loading")}
              />
            ) : (
              <MaterialIcon name="arrow_downward" />
            )}
          </UiButton>
        </Tooltip>
      </div>
    );
  };

  const queryAnchorRail =
    queryAnchorItems.length > 0 && queryAnchorsEnabled ? (
      <nav
        ref={anchorRef}
        className={TIMELINE_QUERY_ANCHOR_RAIL_CLASS_NAME}
        style={
          {
            "--hover-index": (queryAnchorItems.length + 999).toString(),
          } as React.CSSProperties
        }
        onMouseLeave={() => {
          if (!anchorRef.current) return;
          anchorRef.current.style.setProperty(
            "--hover-index",
            (queryAnchorItems.length + 999).toString(),
          );
        }}
      >
        {queryAnchorItems.map((anchor, index) => {
          const active = activeQueryAnchorId === anchor.anchorId;
          return (
            <Tooltip
              key={anchor.key}
              rootClassName={TIMELINE_QUERY_ANCHOR_PREVIEW_CLASS_NAME}
              trigger="hover"
              placement="right"
              title={
                <div>
                  <div
                    className={TIMELINE_QUERY_ANCHOR_PREVIEW_QUERY_CLASS_NAME}
                  >
                    {anchor.queryText}
                  </div>
                  <div
                    className={TIMELINE_QUERY_ANCHOR_PREVIEW_CONTENT_CLASS_NAME}
                  >
                    {anchor.lastRunContent}
                  </div>
                </div>
              }
            >
              <button
                className={[
                  TIMELINE_QUERY_ANCHOR_LINE_CLASS_NAME,
                  active ? TIMELINE_QUERY_ANCHOR_LINE_ACTIVE_CLASS_NAME : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                aria-current={active ? "location" : undefined}
                aria-label={t("conversationStage.queryAnchor", {
                  index: index + 1,
                })}
                onMouseEnter={() => {
                  if (!anchorRef.current) return;
                  anchorRef.current.style.setProperty(
                    "--hover-index",
                    index.toString(),
                  );
                }}
                onClick={() => handleQueryAnchorClick(anchor.anchorId)}
              >
                <span
                  className={TIMELINE_QUERY_ANCHOR_LINE_BAR_CLASS_NAME}
                  aria-hidden="true"
                  style={
                    {
                      "--index": index,
                    } as React.CSSProperties
                  }
                />
              </button>
            </Tooltip>
          );
        })}
      </nav>
    ) : null;

  const renderQueryMeta = (item: Extract<TimelineDisplayItem, { kind: "query" }>) => {
    const time = formatTimelineTime(item.node.ts);
    const copyKey = `${item.key}:copy`;
    const copyStatus = actionStatus[copyKey] || t("timeline.toolPill.copy.action");
    return <div className={TIMELINE_META_ROW_CLASS_NAME}>
      <div className={TIMELINE_META_ACTIONS_CLASS_NAME}>
        <UiButton className={TIMELINE_META_BUTTON_CLASS_NAME} variant="ghost" size="sm" iconOnly
          title={copyStatus} aria-label={copyStatus}
          onClick={() => handleCopy(copyKey, item.node.text || "")}>
          <MaterialIcon name="content_copy" />
        </UiButton>
        <Dropdown placement="bottomRight" menu={{
          onClick: ({ key }) => key === "resend"
            ? handleResend(item.node.text || "", queryResendSnapshot(item.node))
            : handleResendInNewChat(item.node.text || "", queryResendSnapshot(item.node)),
          items: [
            { key: "resend", icon: <MaterialIcon name="refresh" className="tw:!h-3.5 tw:!w-3.5 tw:!text-sm" />, label: t("timeline.query.resend") },
            { key: "resendInNewChat", icon: <MaterialIcon name="open_in_new" className="tw:!h-3.5 tw:!w-3.5 tw:!text-sm" />, label: t("timeline.query.resendInNewChat") },
          ],
        }}>
          <UiButton className={TIMELINE_META_BUTTON_CLASS_NAME} variant="ghost" size="sm" iconOnly
            disabled={agentExecutionBlocked || isMainChatRunning} title={t("timeline.query.resend")} aria-label={t("timeline.query.resend")}>
            <MaterialIcon name="refresh" />
          </UiButton>
        </Dropdown>
      </div>
      {time.short && <div className={TIMELINE_ROW_TIME_CLASS_NAME} title={time.full}>{time.short}</div>}
    </div>;
  };

  const renderRunMeta = (item: Extract<TimelineDisplayItem, { kind: "run" }>, duration: string) => {
    const time = formatTimelineTime(item.completedAt);
    const runId = String(item.runId || "").trim();
    const isDownvoted = Boolean(runId && state.downvotedRunKeys.has(runId));
    const copyKey = `${item.key}:copy`;
    const copyStatus = actionStatus[copyKey] || t("timeline.toolPill.copy.action");
    return <div className={TIMELINE_RUN_META_CLASS_NAME}>
      <div className={TIMELINE_RUN_INFO_CLASS_NAME}>
        <MaterialIcon name="stop_circle" aria-hidden="true" className="tw:shrink-0 tw:leading-none tw:text-ink-muted" />
        {time.short && <div className={TIMELINE_RUN_TIME_CLASS_NAME} title={time.full}>{time.short}</div>}
        {item.terminalType === "run.complete" && duration && <span className="timeline-run-duration tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1 tw:text-xs tw:leading-none tw:text-ink-muted" title={t("timeline.run.responseDuration", { duration })}>{duration}</span>}
      </div>
      <div className={`${TIMELINE_META_ACTIONS_CLASS_NAME}`}>
        <UiButton className={TIMELINE_RUN_ACTION_BUTTON_CLASS_NAME} variant="ghost" size="sm" iconOnly title={copyStatus} aria-label={copyStatus}
          onClick={() => handleCopy(copyKey, serializeRunTranscript(item.queryNode, item.nodes))}>
          <MaterialIcon name="content_copy" />
        </UiButton>
        {isDownvoted ? <UiButton className={`${TIMELINE_RUN_ACTION_BUTTON_CLASS_NAME} ${TIMELINE_META_BUTTON_DOWNVOTED_CLASS_NAME}`}
          variant="ghost" size="sm" iconOnly active title={t("timeline.feedback.clearDownvote")}
          aria-label={t("timeline.feedback.clearDownvote")} disabled={!runId}
          onClick={() => onFeedback(runId, false)}><MaterialIcon name="thumb_down" /></UiButton>
          : <Popover destroyOnHidden trigger={["click"]} content={<FeedbackModal onFinish={({ reason }) => { void onFeedback(runId, true, reason); }} />}>
            <UiButton className={TIMELINE_RUN_ACTION_BUTTON_CLASS_NAME} variant="ghost" size="sm" iconOnly
              title={t("timeline.feedback.downvote")} aria-label={t("timeline.feedback.downvote")} disabled={!runId}>
              <MaterialIcon name="thumb_down" />
            </UiButton>
          </Popover>}
        <UiButton className={TIMELINE_RUN_ACTION_BUTTON_CLASS_NAME} variant="ghost" size="sm" iconOnly
          loading={derivingRunId === runId} title={t("timeline.run.deriveChat")}
          aria-label={t("timeline.run.deriveChat")} disabled={deriveChatAction.isDisabled(runId)}
          onClick={() => handleDeriveChat(runId)}><MaterialIcon name="fork_chat" /></UiButton>
      </div>
    </div>;
  };

  const waitTransport = useRunTransport();
  const interaction = useMemo<TimelineInteractionValue>(() => ({
    activityAppearance: resolveRunActivityAppearance(state.agents.find(agent => agent.key === resolvePreferredAgentKey(state))),
    // "Continue now" is a blank steer, which Platform treats as "continue"; a
    // request.steer without content renders no user message.
    continueWait: async (runId) => {
      const chatId = String(state.chatId || "").trim();
      const owner = resolveRunOwner({ chatId, chats: state.chats, fallbackOwner: resolvePreferredRunOwner(state) });
      if (!chatId || !owner || isAgentExecutionBlocked(state)) return false;
      const response = await waitTransport.steer({
        requestId: createRequestId("req"),
        chatId,
        runId,
        owner,
        message: "",
        references: [],
        planningMode: Boolean(state.planningMode),
      });
      return (response?.data as { accepted?: unknown } | null | undefined)?.accepted === true;
    },
    copyText,
    getChatHref: (chat) => `/?${new URLSearchParams({ chatId: chat.chatId })}`,
    onCopyResult: (success, text) => success
      ? message.success(text ?? t("timeline.toolPill.copy.copied"))
      : message.error(text ?? t("timeline.toolPill.copy.failed")),
    conversationActive: isMainChatRunning || state.streaming,
    getRunStatus: (node) => {
      const terminal = state.events.find((event) => node.runId && event.runId === node.runId &&
        ["run.complete", "run.error", "run.cancel"].includes(event.type))?.type;
      const active = Boolean((!node.runId || mainChatRuntime?.runId === node.runId) && mainChatRuntime?.running);
      return { active, recovering: Boolean(active && mainChatRuntime?.hasActiveRun && !mainChatRuntime.streaming),
        terminal: terminal === "run.complete" || terminal === "run.error" || terminal === "run.cancel" ? terminal : undefined };
    },
    readOnly: false,
    openChat: ({ chatId, agentKey }) => {
      window.dispatchEvent(new CustomEvent("agent:load-chat", { detail: { chatId, agentKey } }));
    },
    registerContextMenuTarget: registerDesktopContextMenuTarget,
    surfaceContext: {
      chatId: state.chatId,
      agentKey: resolvePreferredAgentKey(state),
      teamChat: state.chats.some((chat) => chat.chatId === state.chatId &&
        (Boolean(undefined))),
    },
    setVoiceBlockExpanded: (nodeId, signature, expanded, text, closed) => {
      const node = state.timelineNodes.get(nodeId);
      if (!node) return;
      const current = node.ttsVoiceBlocks?.[signature] || {
        signature, text, closed, expanded: false, status: "ready" as const, error: "",
      };
      dispatch({ type: "SET_TIMELINE_NODE", id: nodeId, node: {
        ...node, ttsVoiceBlocks: {
          ...node.ttsVoiceBlocks,
          [signature]: { ...current, expanded },
        },
      } });
    },
    openTarget,
    replayVoice: (node, signature, text) => {
      void getVoiceRuntime()?.replayTtsVoiceBlock(node.contentId || "", signature, text)
        .catch(() => undefined);
    },
    renderToolView: (view, chatId, error, payloadRaw, node) =>
      <ViewEmbed allowSidebar={surfaceMode === "main"} chatId={chatId} view={view} viewError={error} payloadRaw={payloadRaw} runId={node?.runId} sourceId={node?.id} viewIndex="tool" />,
    renderToolOutput: (output) =>
      <ToolOutputTerminal output={output} themeMode={state.themeMode} />,
    renderContentView: (segment, chatId, binding, runId, sourceId) =>
      <ViewEmbed allowSidebar={surfaceMode === "main"} chatId={chatId} view={binding.view} viewError={binding.viewError} payloadRaw={segment.payloadRaw || "{}"} rawData={segment.payloadRaw} runId={runId} sourceId={sourceId} viewIndex={String(segment.index)} />,
    renderMarkdown: (props) => <MarkdownContent {...props} htmlPreview />,
    renderAttachment: (attachment, options) => <TimelineAttachmentView
      attachment={attachment}
      surfaceContext={{ chatId: state.chatId, agentKey: resolvePreferredAgentKey(state),
        teamChat: state.chats.some((chat) => chat.chatId === state.chatId &&
          (Boolean(undefined))) }}
      options={options} openTarget={openTarget} />,
    setExpanded: (nodeId, expanded) => {
      const node = state.timelineNodes.get(nodeId);
      if (!node) return;
      if (node.kind === "thinking") {
        for (const [reasoningId, id] of state.reasoningNodeById) {
          if (id !== nodeId) continue;
          const timer = state.reasoningCollapseTimers.get(reasoningId);
          if (timer) {
            clearTimeout(timer);
            dispatch({ type: "CLEAR_REASONING_COLLAPSE_TIMER", reasoningId });
          }
          break;
        }
      }
      dispatch({ type: "SET_TIMELINE_NODE", id: nodeId, node: { ...node, expanded } });
    },
    openSource: (source, node) => {
      const publishId = String(node?.sourcePublishId || "").trim();
      if (!publishId) return;
      openTarget({ version: 1, kind: "source", chatId: state.chatId,
        publishId, sourceId: source.id, source, title: source.title || source.name });
    },
  }), [currentWorker, dispatch, isMainChatRunning, mainChatRuntime, message, t, openTarget, state, waitTransport]);

  return (
    <TimelineInteractionProvider value={interaction}>
    <div className={CONVERSATION_STAGE_CLASS_NAME} ref={containerRef}>
      <div
        className="tw:absolute tw:inset-0 tw:flex tw:flex-col"
        data-conversation-content="timeline"
        aria-hidden={presentation.blocked || undefined}
        {...(presentation.blocked ? { inert: "" } : {})}
        style={{ visibility: presentation.blocked ? "hidden" : undefined }}
      >
        {queryAnchorRail
          ? queryAnchorRailHost
            ? createPortal(queryAnchorRail, queryAnchorRailHost)
            : queryAnchorRail
          : null}

        {!state.chatId ? (
          showEmptyState ? (
            <div
              className={[
                TIMELINE_EMPTY_SCROLL_CLASS_NAME,
                TIMELINE_STACK_CLASS_NAME,
                TIMELINE_STACK_EMPTY_CLASS_NAME,
              ].join(" ")}
            >
              {isMainChatRunning || state.streaming ? (
                <LogoLoading text={t("logoLoading.text")} />
              ) : (
                emptyStateContent
              )}
            </div>
          ) : null
        ) : (
          <ConversationStage
            items={virtualItems}
            agents={state.agents}
            skills={activeAgentSkills}
            fallbackAgentKey={currentWorker?.type === "agent" ? currentWorker.sourceId : ""}
            tasks={state.taskItemsById}
            expandedRuns={expandedRunCollapses}
            onToggleRun={toggleRunCollapse}
            expandedTasks={expandedTaskGroups}
            onToggleTask={toggleTaskGroup}
            queryMeta={renderQueryMeta}
            runMeta={renderRunMeta}
            viewport={{
              instanceKey: virtuosoInstanceKey,
              ref: virtuosoRef,
              snapshot: matchingSnapshot,
              scrollerRef: handleScrollerRef,
              followOutput: (atBottom) =>
                restorationReady && !restoringRef.current && followActiveRef.current && atBottom
                  ? "auto" : false,
              atBottomThreshold: CONVERSATION_AT_BOTTOM_THRESHOLD_PX,
              atBottomStateChange: handleAtBottomStateChange,
              totalListHeightChanged: handleTotalListHeightChanged,
              rangeChanged: handleRangeChanged,
              isScrolling: handleIsScrolling,
              Footer: stageFooter,
            }}
          />
        )}

        {renderScrollToBottomControl()}
      </div>
      {presentation.blocked ? (
        <ConversationTransitionOverlay
          busy={presentation.busy}
          error={presentation.error}
          phase={presentation.phase}
          retryLabel={t("surface.retry")}
          onTransitionEnd={presentation.onTransitionEnd}
          onRetry={() => {
            const targetChatId = String(presentation.targetChatId).trim();
            if (!targetChatId) return;
            window.dispatchEvent(
              new CustomEvent("agent:load-chat", {
                detail: {
                  chatId: targetChatId,
                  focusComposerOnComplete:
                    transition?.focusComposerOnReady === true,
                },
              }),
            );
          }}
        />
      ) : null}
    </div>
    </TimelineInteractionProvider>
  );
};

const FeedbackModal: React.FC<{
  onFinish: (values: { reason?: string }) => void;
}> = (props) => {
  const { onFinish } = props;
  const { t } = useI18n();

  return (
    <Form onFinish={onFinish} size="small" style={{ width: 320 }}>
      <strong>{t("timeline.feedback.title")}</strong>
      <Form.Item name="reason" style={{ margin: "10px 0" }}>
        <Input.TextArea
          placeholder={t("timeline.feedback.placeholder")}
          rows={4}
        />
      </Form.Item>
      <Flex gap={10} justify="flex-end">
        <Button type="primary" htmlType="submit">
          {t("timeline.feedback.submit")}
        </Button>
      </Flex>
    </Form>
  );
};

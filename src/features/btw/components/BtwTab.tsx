import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { App as AntdApp, Flex, Input, Popconfirm, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useAppState } from "@/app/state/AppContext";
import type {
  TimelineNode,
  TimelineSource,
} from "@/app/state/types";
import { useBTW } from "@/features/btw/components/BtwProvider";
import {
  TimelineInteractionProvider,
} from "@/features/timeline/components/TimelineInteractionContext";
import { TimelineRow } from "@/features/timeline/components/TimelineRow";
import {
  buildTimelineDisplayItems,
  type TimelineRenderEntry,
} from "@/features/timeline/lib/timelineDisplay";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { useOpenTarget } from "@/features/surfaces/openTarget";

const BTW_TAB_CLASS =
  "btw-tab tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:bg-bg-base";
const BTW_HEADER_CLASS =
  "btw-tab-header tw:flex tw:min-h-10 tw:flex-none tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-line-soft tw:px-3";
const BTW_STATUS_CLASS =
  "btw-tab-status tw:inline-flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:text-xs tw:font-semibold tw:text-ink-muted";
const BTW_STATUS_RUNNING_CLASS = "tw:text-accent-electric-strong";
const BTW_BODY_CLASS = [
  "btw-tab-body tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-3 tw:py-3",
  SCROLLBAR_THIN_CLASS_NAME,
].join(" ");
const BTW_TIMELINE_CLASS =
  "btw-tab-timeline tw:flex tw:min-h-full tw:flex-col tw:justify-end tw:gap-2.5";
const BTW_RUN_CLASS =
  "btw-tab-run tw:flex tw:flex-col tw:gap-2 tw:border-l tw:border-line-soft tw:pl-2";
const BTW_EMPTY_CLASS =
  "btw-tab-empty tw:flex tw:min-h-40 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:text-center tw:text-xs tw:text-ink-muted";
const BTW_COMPOSER_CLASS =
  "btw-tab-composer tw:flex-none tw:border-t tw:border-line-soft tw:p-2";
const BTW_COMPOSER_INNER_CLASS =
  "btw-tab-composer-inner tw:flex tw:min-h-10 tw:items-end tw:gap-1.5 tw:rounded-lg tw:border tw:border-line-soft tw:bg-bg-input tw:p-1.5";

function renderEntry(entry: TimelineRenderEntry): React.ReactNode {
  if (entry.kind === "node") {
    if (entry.node.kind === "agent-group") return null;
    return <TimelineRow key={entry.key} node={entry.node} />;
  }
  if (entry.kind === "tool-group") {
    return <TimelineRow key={entry.key} toolGroup={entry} />;
  }
  return (
    <div key={entry.key} className={BTW_RUN_CLASS}>
      {entry.renderEntries.map(renderEntry)}
    </div>
  );
}

export const BtwTab: React.FC = () => {
  const state = useAppState();
  const openTarget = useOpenTarget();
  const { t } = useI18n();
  const { message } = AntdApp.useApp();
  const {
    getSession,
    sendBTW,
    setDraft,
    patchTimelineNode,
    newBranch,
    interruptBTW,
  } = useBTW();
  const parentChatId = String(state.chatId || "").trim();
  const session = getSession(parentChatId);
  const textareaRef = useRef<TextAreaRef>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draft = session?.draft || "";
  const running = session?.status === "running";
  const interruptReady = Boolean(session?.interruptReady);
  const interruptPending = Boolean(session?.interruptPending);

  const timelineEntries = useMemo(() => {
    if (!session) return [];
    return session.projection.timelineOrder
      .map((id) => session.projection.timelineNodes.get(id))
      .filter((node): node is TimelineNode => Boolean(node));
  }, [session]);
  const displayItems = useMemo(
    () =>
      session
        ? buildTimelineDisplayItems(
            timelineEntries,
            session.projection.events,
            session.projection.taskItemsById,
          )
        : [],
    [session, timelineEntries],
  );
  const canResetBranch = Boolean(
    session?.btwId || session?.error || timelineEntries.length > 0,
  );

  useEffect(() => {
    if (!session?.focusToken) return;
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [session?.focusToken]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
  }, [displayItems, running]);

  const handleSend = useCallback(() => {
    if (!parentChatId || !draft.trim() || running) return;
    void sendBTW(parentChatId, draft);
  }, [draft, parentChatId, running, sendBTW]);

  const handleInterrupt = useCallback(() => {
    if (!parentChatId || !running || !interruptReady || interruptPending) return;
    void interruptBTW(parentChatId);
  }, [
    interruptBTW,
    interruptPending,
    interruptReady,
    parentChatId,
    running,
  ]);

  const interaction = useMemo(
    () => ({
      conversationActive: running,
      patchNode: (node: TimelineNode) =>
        patchTimelineNode(parentChatId, node),
      openSource: (source: TimelineSource, node?: TimelineNode) => {
        const publishId = String(node?.sourcePublishId || "").trim();
        if (!publishId) return;
        openTarget({
          version: 1,
          kind: "source",
          chatId: parentChatId,
          btwId: session?.btwId || undefined,
          publishId,
          sourceId: source.id,
          source,
          title: source.title || source.name,
        });
      },
    }),
    [openTarget, parentChatId, patchTimelineNode, running, session?.btwId],
  );

  if (!parentChatId) {
    return (
      <div className={BTW_EMPTY_CLASS}>
        <MaterialIcon name="question_answer" />
        <span>{t("btw.noChat")}</span>
      </div>
    );
  }

  return (
    <TimelineInteractionProvider value={interaction}>
      <section className={BTW_TAB_CLASS} aria-label={t("btw.title")}>
        <div className={BTW_HEADER_CLASS}>
          <span
            className={[
              BTW_STATUS_CLASS,
              running ? BTW_STATUS_RUNNING_CLASS : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <MaterialIcon name={running ? "progress_activity" : "lock"} />
            <span>{t(running ? "btw.status.running" : "btw.status.readOnly")}</span>
          </span>
          <Flex gap={2}>
            {session ? (
              <Tooltip title={t("planningTimeline.openInSidebar")}>
                <UiButton
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t("planningTimeline.openInSidebar")}
                  onClick={() => openTarget({
                    version: 1,
                    kind: "btw",
                    chatId: parentChatId,
                    btwId: session.btwId || undefined,
                  })}
                >
                  <MaterialIcon name="open_in_new" />
                </UiButton>
              </Tooltip>
            ) : null}
            <Popconfirm
              title={t("btw.new.confirmTitle")}
              description={t("btw.new.confirmDescription")}
              okText={t("btw.new.confirm")}
              cancelText={t("btw.new.cancel")}
              disabled={running || !canResetBranch}
              onConfirm={() => {
                if (newBranch(parentChatId)) {
                  void message.success(t("btw.new.created"));
                }
              }}
            >
              <Tooltip title={t("btw.new.action")}>
                <UiButton
                  variant="ghost"
                  size="sm"
                  iconOnly
                  disabled={running || !canResetBranch}
                  aria-label={t("btw.new.action")}
                >
                  <MaterialIcon name="add" />
                </UiButton>
              </Tooltip>
            </Popconfirm>
          </Flex>
        </div>
        <div ref={scrollRef} className={BTW_BODY_CLASS}>
          {displayItems.length === 0 ? (
            <div className={BTW_EMPTY_CLASS}>
              <MaterialIcon name="question_answer" />
              <span>{t("btw.empty")}</span>
            </div>
          ) : (
            <div className={BTW_TIMELINE_CLASS}>
              {displayItems.map((item) => {
                if (item.kind === "query") {
                  return <TimelineRow key={item.key} node={item.node} />;
                }
                if (item.kind === "run") {
                  return (
                    <div key={item.key} className={BTW_RUN_CLASS}>
                      {item.renderEntries.map(renderEntry)}
                    </div>
                  );
                }
                return renderEntry(item.renderEntry);
              })}
            </div>
          )}
        </div>
        <div className={BTW_COMPOSER_CLASS}>
          <div className={BTW_COMPOSER_INNER_CLASS}>
            <Input.TextArea
              ref={textareaRef}
              value={draft}
              autoSize={{ minRows: 1, maxRows: 6 }}
              variant="borderless"
              placeholder={t("btw.composer.placeholder")}
              disabled={running}
              onChange={(event) => setDraft(parentChatId, event.target.value)}
              onPressEnter={(event) => {
                if (event.shiftKey) return;
                event.preventDefault();
                handleSend();
              }}
            />
            {running ? (
              <UiButton
                variant="danger"
                size="sm"
                iconOnly
                disabled={!interruptReady || interruptPending}
                loading={interruptPending}
                aria-label={t("btw.stop")}
                title={t("btw.stop")}
                onClick={handleInterrupt}
              >
                <MaterialIcon
                  name={interruptPending ? "progress_activity" : "stop_circle"}
                  className={interruptPending ? "tw:animate-ui-spin" : ""}
                />
              </UiButton>
            ) : (
              <UiButton
                variant="primary"
                size="sm"
                iconOnly
                disabled={!draft.trim()}
                aria-label={t("btw.send")}
                title={t("btw.send")}
                onClick={handleSend}
              >
                <MaterialIcon name="arrow_upward" />
              </UiButton>
            )}
          </div>
        </div>
      </section>
    </TimelineInteractionProvider>
  );
};

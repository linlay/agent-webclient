import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer, Spin, Tabs, message } from "antd";
import type { Agent, Team } from "@/app/state/types";
import type {
  AutomationExecutionDetailResponse,
  AutomationExecutionResponse,
  ChatDetailResponse,
} from "@/shared/data";
import {
  getAutomationExecution,
  getChat,
} from "@/shared/data";
import {
  buildChatReplayProjection,
  type ChatReplayProjection,
} from "@/features/conversation/lib/chatReplayProjection";
import {
  automationExecutionDateTimeLabel,
  automationExecutionDurationLabel,
} from "@/features/automations/lib/executionView";
import { ReadOnlyConversationTimeline } from "@/features/conversation/components/ReadOnlyConversationTimeline";
import { AgentIcon } from "@/shared/icons/agent";
import { MarkdownContent } from "@/features/viewers/components/MarkdownContent";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { copyText } from "@/shared/utils/copy";
import { useI18n } from "@/shared/i18n";
import styles from "./AutomationExecutionDrawer.module.css";

const COMPACT_DRAWER_QUERY = "(max-width: 859px)";

const STATUS_ICON: Record<
  AutomationExecutionResponse["status"],
  MaterialIconName
> = {
  running: "progress_activity",
  success: "check",
  failed: "error",
  canceled: "stop_circle",
};

interface PanelState<T> {
  data: T | null;
  loading: boolean;
  error: string;
}

interface ChatSnapshot {
  chat: ChatDetailResponse;
  projection: ChatReplayProjection;
}

function initialPanelState<T>(): PanelState<T> {
  return { data: null, loading: false, error: "" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useCompactDrawerLayout(): boolean {
  const read = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COMPACT_DRAWER_QUERY).matches;
  const [compact, setCompact] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(COMPACT_DRAWER_QUERY);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return compact;
}

export interface AutomationExecutionDrawerProps {
  execution: AutomationExecutionResponse | null;
  agents: Agent[];
  teams: Team[];
  refreshRevision?: number;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

export const AutomationExecutionDrawer: React.FC<
  AutomationExecutionDrawerProps
> = ({
  execution,
  agents,
  teams,
  refreshRevision = 0,
  returnFocusRef,
  onClose,
}) => {
  const { locale, t } = useI18n();
  const compact = useCompactDrawerLayout();
  const [activeTab, setActiveTab] = useState("execution");
  const [detailState, setDetailState] = useState<
    PanelState<AutomationExecutionDetailResponse>
  >(initialPanelState);
  const [chatState, setChatState] = useState<PanelState<ChatSnapshot>>(
    initialPanelState,
  );
  const viewerEpochRef = useRef(0);
  const detailRequestRef = useRef(0);
  const chatRequestRef = useRef(0);
  const executionRef = useRef(execution);
  const refreshRevisionRef = useRef(refreshRevision);
  executionRef.current = execution;

  const isCurrent = useCallback((executionId: string, epoch: number) => {
    return (
      viewerEpochRef.current === epoch &&
      executionRef.current?.id === executionId
    );
  }, []);

  const loadChatSnapshot = useCallback(
    async (
      chatId: string,
      executionId: string,
      epoch: number,
      reset: boolean,
    ) => {
      const normalizedChatId = String(chatId || "").trim();
      if (!normalizedChatId) {
        if (isCurrent(executionId, epoch)) {
          setChatState(initialPanelState());
        }
        return;
      }
      const request = ++chatRequestRef.current;
      setChatState((current) => ({
        data: reset ? null : current.data,
        loading: true,
        error: "",
      }));
      try {
        const response = await getChat(normalizedChatId, false);
        if (
          request !== chatRequestRef.current ||
          !isCurrent(executionId, epoch)
        ) {
          return;
        }
        setChatState({
          data: {
            chat: response.data,
            projection: buildChatReplayProjection(
              normalizedChatId,
              response.data,
            ),
          },
          loading: false,
          error: "",
        });
      } catch (error) {
        if (
          request !== chatRequestRef.current ||
          !isCurrent(executionId, epoch)
        ) {
          return;
        }
        setChatState((current) => ({
          data: reset ? null : current.data,
          loading: false,
          error: errorMessage(error),
        }));
      }
    },
    [isCurrent],
  );

  const loadExecutionDetail = useCallback(
    async (
      item: AutomationExecutionResponse,
      epoch: number,
      reset: boolean,
    ) => {
      const request = ++detailRequestRef.current;
      setDetailState((current) => ({
        data: reset ? null : current.data,
        loading: true,
        error: "",
      }));
      try {
        const response = await getAutomationExecution({ executionId: item.id });
        if (
          request !== detailRequestRef.current ||
          !isCurrent(item.id, epoch)
        ) {
          return;
        }
        setDetailState({ data: response.data, loading: false, error: "" });

        const detailChatId = String(response.data.chatId || "").trim();
        const initialChatId = String(item.chatId || "").trim();
        if (detailChatId && detailChatId !== initialChatId) {
          void loadChatSnapshot(detailChatId, item.id, epoch, true);
        }
      } catch (error) {
        if (
          request !== detailRequestRef.current ||
          !isCurrent(item.id, epoch)
        ) {
          return;
        }
        setDetailState((current) => ({
          data: reset ? null : current.data,
          loading: false,
          error: errorMessage(error),
        }));
      }
    },
    [isCurrent, loadChatSnapshot],
  );

  useEffect(() => {
    const epoch = ++viewerEpochRef.current;
    detailRequestRef.current += 1;
    chatRequestRef.current += 1;
    setActiveTab("execution");
    setDetailState(initialPanelState());
    setChatState(initialPanelState());
    if (!execution) return;

    void loadExecutionDetail(execution, epoch, true);
    const chatId = String(execution.chatId || "").trim();
    if (chatId) {
      void loadChatSnapshot(chatId, execution.id, epoch, true);
    }
  }, [execution?.id, loadChatSnapshot, loadExecutionDetail]);

  useEffect(() => {
    if (refreshRevisionRef.current === refreshRevision) return;
    refreshRevisionRef.current = refreshRevision;
    const item = executionRef.current;
    if (!item) return;
    const epoch = viewerEpochRef.current;
    void loadExecutionDetail(item, epoch, false);
    const chatId = String(
      detailState.data?.chatId || item.chatId || "",
    ).trim();
    if (chatId) {
      void loadChatSnapshot(chatId, item.id, epoch, false);
    }
  }, [detailState.data?.chatId, loadChatSnapshot, loadExecutionDetail, refreshRevision]);

  useEffect(
    () => () => {
      viewerEpochRef.current += 1;
      detailRequestRef.current += 1;
      chatRequestRef.current += 1;
    },
    [],
  );

  const visible = detailState.data || execution;
  const chatId = String(
    detailState.data?.chatId || execution?.chatId || "",
  ).trim();
  const teamId = String(
    detailState.data?.teamId || execution?.teamId || chatState.data?.chat.teamId || "",
  ).trim();
  const agentKey = String(
    detailState.data?.agentKey ||
      execution?.agentKey ||
      chatState.data?.chat.agentKey ||
      chatState.data?.chat.firstAgentKey ||
      "",
  ).trim();
  const team = teams.find((item) => item.teamId === teamId);
  const agent = agents.find((item) => item.key === agentKey);
  const workerName = teamId
    ? String(team?.name || teamId)
    : String(agent?.name || chatState.data?.chat.firstAgentName || agentKey || "--");
  const workerIcon = teamId ? team?.icon : agent?.icon;
  const workerType = teamId ? "team" : "agent";

  const copy = useCallback(
    async (value: string) => {
      await copyText(value);
      message.success(t("automationHistory.message.copied"));
    },
    [t],
  );

  const renderPanelError = (error: string, onRetry: () => void) => (
    <div className={styles.panelError} role="alert">
      <MaterialIcon name="error" />
      <span>{error}</span>
      <UiButton
        size="sm"
        variant="ghost"
        aria-label={t("automationHistory.action.reload")}
        onClick={onRetry}
      >
        <MaterialIcon name="refresh" />
        {t("automationHistory.action.reload")}
      </UiButton>
    </div>
  );

  const executionPanel = (
    <section className={styles.panel} aria-label={t("automationHistory.panel.execution")}>
      {!compact ? <h3>{t("automationHistory.panel.execution")}</h3> : null}
      <div className={styles.panelScroll} aria-busy={detailState.loading}>
        {detailState.error
          ? renderPanelError(detailState.error, () => {
              if (execution) {
                void loadExecutionDetail(
                  execution,
                  viewerEpochRef.current,
                  !detailState.data,
                );
              }
            })
          : null}
        {detailState.loading && !detailState.data ? (
          <div className={styles.panelLoading} role="status">
            <Spin size="small" />
          </div>
        ) : detailState.data && visible ? (
          <div className={styles.resultContent}>
            <div className={styles.resultMarkdown}>
              {detailState.data.resultContent ? (
                <MarkdownContent
                  content={detailState.data.resultContent}
                  chatId={chatId}
                  teamChat={Boolean(teamId)}
                />
              ) : (
                <div className={styles.emptyResult}>
                  {t("automationHistory.result.empty")}
                </div>
              )}
            </div>
            {detailState.data.resultContent ? (
              <UiButton
                size="sm"
                variant="ghost"
                className={styles.copyResult}
                aria-label={t("automationHistory.action.copyResult")}
                onClick={() => void copy(detailState.data?.resultContent || "")}
              >
                <MaterialIcon name="content_copy" />
                {t("automationHistory.action.copyResult")}
              </UiButton>
            ) : null}
            <dl className={styles.resultMeta}>
              {visible.error ? (
                <div className={styles.errorMeta}>
                  <dt>{t("automationHistory.result.error")}</dt>
                  <dd>{visible.error}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t("automationHistory.field.finishReason")}</dt>
                <dd>{visible.finishReason || "--"}</dd>
              </div>
              <div>
                <dt>{t("automationHistory.field.executionId")}</dt>
                <dd>
                  <button
                    type="button"
                    aria-label={t("automationHistory.action.copyExecutionId")}
                    onClick={() => void copy(visible.id)}
                  >
                    <span>{visible.id}</span>
                    <MaterialIcon name="content_copy" />
                  </button>
                </dd>
              </div>
              {visible.runId ? (
                <div>
                  <dt>{t("automationHistory.field.runId")}</dt>
                  <dd>
                    <button
                      type="button"
                      aria-label={t("automationHistory.action.copyRunId")}
                      onClick={() => void copy(visible.runId || "")}
                    >
                      <span>{visible.runId}</span>
                      <MaterialIcon name="content_copy" />
                    </button>
                  </dd>
                </div>
              ) : null}
            </dl>
            {detailState.data.queryContent ? (
              <details className={styles.queryDetails}>
                <summary>{t("automationHistory.result.queryContent")}</summary>
                <pre>{detailState.data.queryContent}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
        {detailState.loading && detailState.data ? (
          <span className={styles.refreshing} role="status">
            <Spin size="small" />
          </span>
        ) : null}
      </div>
    </section>
  );

  const chatPanel = (
    <section className={styles.panel} aria-label={t("automationHistory.panel.chat")}>
      <div className={styles.chatHeading}>
        {!compact ? <h3>{t("automationHistory.panel.chat")}</h3> : null}
        <span className={styles.workerIdentity}>
          <AgentIcon
            icon={workerIcon}
            type={workerType}
            props={{
              icon: { width: 18, height: 18 },
              avatar: { size: 18 },
            }}
          />
          <span>{workerName}</span>
        </span>
      </div>
      <div className={styles.chatBody} aria-busy={chatState.loading}>
        {!chatId ? (
          <div className={styles.chatEmpty} role="status">
            {t("automationHistory.chat.noAssociation")}
          </div>
        ) : (
          <>
            {chatState.error
              ? renderPanelError(chatState.error, () => {
                  if (execution) {
                    void loadChatSnapshot(
                      chatId,
                      execution.id,
                      viewerEpochRef.current,
                      !chatState.data,
                    );
                  }
                })
              : null}
            {chatState.loading && !chatState.data ? (
              <div className={styles.panelLoading} role="status">
                <Spin size="small" />
              </div>
            ) : chatState.data ? (
              <ReadOnlyConversationTimeline
                chat={chatState.data.chat}
                projection={chatState.data.projection}
                agents={agents}
                agentKey={agentKey}
                teamChat={Boolean(teamId)}
              />
            ) : null}
            {chatState.loading && chatState.data ? (
              <span className={styles.refreshing} role="status">
                <Spin size="small" />
              </span>
            ) : null}
          </>
        )}
      </div>
    </section>
  );

  const title = visible ? (
    <div className={styles.drawerTitle}>
      <div className={styles.drawerTitleLine}>
        <strong>{visible.automationName || visible.automationId}</strong>
        <span>{t("automationHistory.drawer.title")}</span>
      </div>
      <div className={styles.drawerMeta}>
        <span className={`${styles.status} ${styles[visible.status]}`}>
          <MaterialIcon name={STATUS_ICON[visible.status]} />
          {t(`automationHistory.status.${visible.status}`)}
        </span>
        <span>{automationExecutionDateTimeLabel(visible, locale)}</span>
        <span aria-hidden="true">·</span>
        <span>{automationExecutionDurationLabel(visible.durationMs)}</span>
      </div>
    </div>
  ) : null;

  return (
    <Drawer
      open={Boolean(execution)}
      title={title}
      placement="right"
      width="min(1180px, calc(100vw - 24px))"
      rootClassName={styles.drawer}
      keyboard
      destroyOnHidden
      closable={{ closeIcon: <MaterialIcon name="close" /> }}
      onClose={onClose}
      afterOpenChange={(open) => {
        if (!open) {
          window.requestAnimationFrame(() => returnFocusRef?.current?.focus());
        }
      }}
    >
      {compact ? (
        <Tabs
          className={styles.tabs}
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "execution",
              label: t("automationHistory.tab.execution"),
              children: executionPanel,
            },
            {
              key: "chat",
              label: t("automationHistory.tab.chat"),
              children: chatPanel,
            },
          ]}
        />
      ) : (
        <div className={styles.columns}>
          {executionPanel}
          {chatPanel}
        </div>
      )}
    </Drawer>
  );
};

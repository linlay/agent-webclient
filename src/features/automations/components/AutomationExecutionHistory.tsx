import { useEffect, useMemo, useState } from "react";
import { Dropdown, Spin, Tooltip } from "antd";
import {
  automationExecutionDateTimeLabel,
  automationExecutionDurationLabel,
  automationExecutionPreview,
  automationExecutionTimeLabel,
  groupAutomationExecutions,
} from "@/features/automations/lib/executionView";
import type {
  AutomationExecutionHistoryStatus,
  AutomationExecutionResponse,
  AutomationExecutionStatus,
  AutomationSummaryResponse,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { copyText } from "@/shared/utils/copy";
import styles from "./AutomationHistoryConsole.module.css";

const STATUS_ICON: Record<AutomationExecutionStatus, MaterialIconName> = {
  running: "progress_activity",
  success: "check",
  failed: "error",
  canceled: "stop_circle",
};

export interface AutomationExecutionHistoryProps {
  actionBusy: boolean;
  executionError: string;
  executionLoading: boolean;
  executions: AutomationExecutionResponse[];
  executionTotal: number;
  historyStatus: AutomationExecutionHistoryStatus;
  moreLoading: boolean;
  selected: AutomationSummaryResponse | null;
  selectedTriggering: boolean;
  onCreate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onRetryExecutions: () => void;
  onToggle: () => void;
  onTrigger: () => void;
  onView: (execution: AutomationExecutionResponse, trigger: HTMLElement) => void;
}

export function AutomationExecutionHistory({
  actionBusy,
  executionError,
  executionLoading,
  executions,
  executionTotal,
  historyStatus,
  moreLoading,
  selected,
  selectedTriggering,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onLoadMore,
  onRefresh,
  onRetryExecutions,
  onToggle,
  onTrigger,
  onView,
}: AutomationExecutionHistoryProps) {
  const { locale, t } = useI18n();
  const [expandedId, setExpandedId] = useState("");
  const groupedExecutions = useMemo(
    () =>
      groupAutomationExecutions(executions, {
        locale,
        todayLabel: t("automationHistory.day.today"),
        yesterdayLabel: t("automationHistory.day.yesterday"),
      }),
    [executions, locale, t],
  );

  useEffect(() => {
    setExpandedId((current) =>
      current && executions.some((item) => item.id === current)
        ? current
        : executions[0]?.id || "",
    );
  }, [executions]);

  if (!selected) {
    return (
      <section className={styles.main}>
        <div className={styles.emptySelection}>
          <MaterialIcon name="schedule" />
          <h2>{t("automationHistory.empty.automations")}</h2>
          <UiButton size="sm" variant="primary" onClick={onCreate}>
            <MaterialIcon name="add" />
            {t("automationConsole.action.create")}
          </UiButton>
        </div>
      </section>
    );
  }

  const moreSettingsMenu = {
    items: [
      {
        key: "trigger",
        icon: (
          <MaterialIcon
            name={selectedTriggering ? "progress_activity" : "bolt"}
            className={selectedTriggering ? "tw:animate-ui-spin" : ""}
          />
        ),
        label: t("automationConsole.action.triggerNow"),
        disabled: selectedTriggering,
        onClick: onTrigger,
      },
      {
        key: "copy",
        icon: <MaterialIcon name="content_copy" />,
        label: t("automationConsole.action.copy"),
        onClick: onDuplicate,
      },
    ],
  };

  return (
    <section className={styles.main}>
      <header className={styles.mainHeader}>
        <div className={styles.overviewCopy}>
          <span className={styles.overviewIcon}>
            <MaterialIcon name="bar_chart" />
          </span>
          <div className={styles.overviewContent}>
            <h2>{t("automationHistory.overview.title")}</h2>
            <div className={styles.overviewStats}>
              <span>
                <small>{t("automationHistory.overview.total")}</small>
                <strong>{executionTotal}</strong>
              </span>
              <span>
                <small>{t("automationHistory.overview.last")}</small>
                <strong
                  className={
                    selected.lastExecution ? styles[selected.lastExecution.status] : ""
                  }
                >
                  {selected.lastExecution
                    ? t(`automationHistory.status.${selected.lastExecution.status}`)
                    : t("automationHistory.last.never")}
                </strong>
              </span>
              <span>
                <small>{t("automationHistory.overview.next")}</small>
                <strong>{selected.nextFireTime || "--"}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Tooltip title={t("automationHistory.action.edit")} arrow={false}>
            <UiButton
              size="sm"
              variant="secondary"
              className="ui-icon-hover-24"
              iconOnly
              aria-label={t("automationHistory.action.edit")}
              onClick={onEdit}
            >
              <MaterialIcon name="edit" />
            </UiButton>
          </Tooltip>
          <Tooltip
            title={
              selected.enabled
                ? t("automationConsole.action.disable")
                : t("automationConsole.action.enable")
            }
            arrow={false}
          >
            <UiButton
              size="sm"
              variant="ghost"
              className="ui-icon-hover-24"
              iconOnly
              aria-label={
                selected.enabled
                  ? t("automationConsole.action.disable")
                  : t("automationConsole.action.enable")
              }
              disabled={actionBusy}
              onClick={onToggle}
            >
              <MaterialIcon name={selected.enabled ? "pause_circle" : "play_circle"} />
            </UiButton>
          </Tooltip>
          <Tooltip title={t("automationConsole.action.delete")} arrow={false}>
            <UiButton
              size="sm"
              variant="ghost"
              className={`${styles.deleteAction} ui-icon-hover-24`}
              iconOnly
              aria-label={t("automationConsole.action.delete")}
              disabled={actionBusy}
              onClick={onDelete}
            >
              <MaterialIcon name="delete" />
            </UiButton>
          </Tooltip>
          <Tooltip title={t("automationHistory.action.moreSettings")} arrow={false}>
            <Dropdown menu={moreSettingsMenu} trigger={["click"]} placement="bottomRight">
              <UiButton
                size="sm"
                variant="ghost"
                className="ui-icon-hover-24"
                iconOnly
                loading={actionBusy}
                aria-label={t("automationHistory.action.moreSettings")}
              >
                <MaterialIcon name="more_horiz" />
              </UiButton>
            </Dropdown>
          </Tooltip>
        </div>
      </header>

      <div className={styles.historyBody}>
        <div className={styles.historyHeading}>
          <h3>{t("automationHistory.title")}</h3>
          <div className={styles.historyHeadingActions}>
            <span>{t("automationHistory.count", { count: executionTotal })}</span>
            <Tooltip title={t("automationConsole.action.refresh")}>
              <UiButton
                size="sm"
                variant="ghost"
                iconOnly
                className="ui-icon-hover-24"
                aria-label={t("automationConsole.action.refresh")}
                onClick={onRefresh}
                disabled={executionLoading}
              >
                <MaterialIcon name="refresh" />
              </UiButton>
            </Tooltip>
          </div>
        </div>

        {historyStatus.state !== "ready" ? (
          <div
            className={`${styles.historyNotice} ${historyStatus.available ? styles.degradedNotice : ""}`}
          >
            <MaterialIcon name={historyStatus.available ? "warning" : "error"} />
            <div>
              <strong>{t(`automationHistory.historyState.${historyStatus.state}`)}</strong>
              <p>{historyStatus.message || t("automationHistory.historyState.fallback")}</p>
            </div>
            <UiButton size="sm" variant="ghost" onClick={onRefresh}>
              {t("automationHistory.action.recheck")}
            </UiButton>
          </div>
        ) : null}

        {executionError ? (
          <div className={styles.executionError}>
            <span>{executionError}</span>
            <UiButton size="sm" variant="ghost" onClick={onRetryExecutions}>
              {t("automationConsole.action.retry")}
            </UiButton>
          </div>
        ) : null}

        <Spin spinning={executionLoading}>
          {historyStatus.available && executions.length === 0 && !executionLoading ? (
            <div className={styles.emptyHistory}>
              <MaterialIcon name="history" />
              <h3>{t("automationHistory.empty.title")}</h3>
              <p>
                {selected.enabled
                  ? t("automationHistory.empty.enabled")
                  : t("automationHistory.empty.paused")}
              </p>
            </div>
          ) : (
            <div className={styles.timeline}>
              {groupedExecutions.map((group) => (
                <section className={styles.dayGroup} key={group.key}>
                  <h4>{group.label}</h4>
                  <div className={styles.dayRows}>
                    {group.items.map((item) => {
                      const expanded = item.id === expandedId;
                      const preview = automationExecutionPreview(item, {
                        running: t("automationHistory.preview.running"),
                        empty: t("automationHistory.preview.empty"),
                      });
                      return (
                        <article className={styles.executionRow} key={item.id}>
                          <span className={`${styles.timelineMarker} ${styles[item.status]}`}>
                            <MaterialIcon name={STATUS_ICON[item.status]} />
                          </span>
                          <button
                            type="button"
                            className={styles.executionSummary}
                            onClick={() => setExpandedId(expanded ? "" : item.id)}
                            aria-expanded={expanded}
                          >
                            <time>{automationExecutionTimeLabel(item, locale)}</time>
                            <span className={`${styles.status} ${styles[item.status]}`}>
                              {t(`automationHistory.status.${item.status}`)}
                            </span>
                            <span className={styles.duration}>
                              {automationExecutionDurationLabel(item.durationMs)}
                            </span>
                            <span className={styles.preview}>{preview}</span>
                            <MaterialIcon
                              name={expanded ? "keyboard_arrow_down" : "keyboard_arrow_right"}
                              className={styles.chevron}
                            />
                          </button>
                          {expanded ? (
                            <div className={styles.executionDetail}>
                              <div className={styles.executionMeta}>
                                <span>{automationExecutionDateTimeLabel(item, locale)}</span>
                                {item.runId ? (
                                  <button
                                    type="button"
                                    onClick={() => void copyText(item.runId || "")}
                                  >
                                    {item.runId}
                                    <MaterialIcon name="content_copy" />
                                  </button>
                                ) : null}
                                <span>{item.finishReason || "--"}</span>
                              </div>
                              {item.error ? (
                                <p className={styles.executionInlineError}>{item.error}</p>
                              ) : null}
                              {item.hasResult || Boolean(String(item.chatId || "").trim()) ? (
                                <div className={styles.executionActions}>
                                  <button
                                    type="button"
                                    aria-label={t("automationHistory.action.view")}
                                    onClick={(event) => onView(item, event.currentTarget)}
                                  >
                                    {t("automationHistory.action.view")}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              {executions.length < executionTotal ? (
                <UiButton
                  className={styles.loadMore}
                  size="sm"
                  variant="ghost"
                  loading={moreLoading}
                  onClick={onLoadMore}
                >
                  <MaterialIcon name="keyboard_arrow_down" />
                  {t("automationHistory.action.loadMore")}
                </UiButton>
              ) : null}
            </div>
          )}
        </Spin>
      </div>
    </section>
  );
}

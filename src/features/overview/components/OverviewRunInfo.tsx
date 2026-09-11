import React from "react";
import { message } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";
import { formatResponseDuration } from "@/shared/utils/formatResponseDuration";
import { formatCompactUsageNumber } from "@/features/usage/lib/usageMetrics";
import { formatOverviewTime, type OverviewRunInfo } from "@/features/overview/lib/overviewRunInfo";
import styles from "./OverviewRunInfo.module.css";

function contextLevel(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}

export const OverviewRunInfoSection: React.FC<{
  info: OverviewRunInfo;
  hasContent: boolean;
}> = ({ info, hasContent }) => {
  const { t, locale } = useI18n();
  const [manualExpanded, setManualExpanded] = React.useState<boolean | null>(null);
  const expanded = manualExpanded ?? !hasContent;
  const [now, setNow] = React.useState(Date.now);
  const detailsId = React.useId();
  const [messageApi, messageContext] = message.useMessage();
  React.useEffect(() => {
    setNow(Date.now());
    if (!info.active || !info.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [info.active, info.startedAt, info.runId]);
  const end = info.finishedAt ?? (info.active ? now : undefined);
  const duration = info.startedAt && end !== undefined
    ? formatResponseDuration(Math.max(0, end - info.startedAt), t) : "";
  const startTime = formatOverviewTime(info.startedAt, locale, now);
  const endTime = formatOverviewTime(info.finishedAt, locale, now);
  const model = [info.model || "—", info.reasoning].filter(Boolean).join(" · ");
  const executor = [info.agent, info.team].filter(Boolean).join(" · ") || "—";
  const copy = async (value: string) => {
    try {
      await copyText(value);
      messageApi.success(t("rightSidebar.copy.success"));
    } catch {
      messageApi.error(t("rightSidebar.overview.runInfo.copyFailed"));
    }
  };
  const idButton = (label: string, value: string) => (
    <button type="button" className={styles.identifier} disabled={!value}
      title={value || "—"} aria-label={t("rightSidebar.overview.runInfo.copyId", { label })}
      onClick={() => void copy(value)}>
      <span className={styles.idLabel}>{label}</span>
      <span className={styles.idValue}>{value || "—"}</span>
      {value ? <MaterialIcon name="content_copy" aria-hidden="true" /> : null}
    </button>
  );
  return (
    <section className={styles.section} aria-label={t("rightSidebar.overview.runInfo.title")}>
      {messageContext}
      <button type="button" className={styles.header} aria-expanded={expanded}
        aria-controls={detailsId} onClick={() => setManualExpanded(!expanded)}>
        <MaterialIcon name={expanded ? "expand_more" : "chevron_right"} aria-hidden="true" />
        <span className={styles.title}>{t("rightSidebar.overview.runInfo.title")}</span>
        <span className={styles.status} data-status={info.status}>
          <span className={styles.statusDot} data-status={info.status} aria-hidden="true" />
          {t(`rightSidebar.overview.runInfo.status.${info.status}`)}
        </span>
        {duration ? <span className={styles.duration}>· {duration}</span> : null}
      </button>
      <div id={detailsId} hidden={!expanded} className={styles.details}>
        <dl className={styles.properties}>
          <div className={styles.row}>
            <dt>{t("rightSidebar.overview.runInfo.executor")}</dt>
            <dd title={executor}>{executor}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t("rightSidebar.overview.runInfo.model")}</dt>
            <dd title={model} className={styles.model}>
              <span className={styles.modelName}>{info.model || "—"}</span>
              {info.reasoning ? <span className={styles.reasoning}> · {info.reasoning}</span> : null}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t("rightSidebar.overview.runInfo.context")}</dt>
            <dd className={styles.context}>
              {info.context ? <>
                <div className={styles.contextHead}>
                  <span className={styles.contextValue} title={`${info.context.current.toLocaleString(locale)} / ${info.context.max.toLocaleString(locale)}`}>
                    {formatCompactUsageNumber(info.context.current)} / {formatCompactUsageNumber(info.context.max)}
                  </span>
                  <span className={styles.percent} data-level={contextLevel(info.context.percent)}>
                    {info.context.percent}%
                  </span>
                </div>
                <progress className={styles.progress} max={100} value={Math.min(100, info.context.percent)}
                  data-level={contextLevel(info.context.percent)}
                  aria-label={t("rightSidebar.overview.runInfo.context")} />
              </> : "—"}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t("rightSidebar.overview.runInfo.startedAt")}</dt>
            <dd title={startTime.full}>{startTime.short}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t("rightSidebar.overview.runInfo.finishedAt")}</dt>
            <dd title={endTime.full}>{endTime.short}</dd>
          </div>
        </dl>
        <div className={styles.identifiers}>
          {idButton("Chat ID", info.chatId)}
          {idButton("Run ID", info.runId)}
        </div>
      </div>
    </section>
  );
};

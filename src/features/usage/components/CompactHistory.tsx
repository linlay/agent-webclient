import React from "react";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { formatCompactStats } from "@/shared/utils/contextCompactStats";
import { collectCompactHistory } from "../lib/compactHistory";
import styles from "./CompactHistory.module.css";

export function CompactHistory({ chatId, events }: { chatId: string; events: readonly AgentEvent[] }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const listId = React.useId();
  const stages = React.useMemo(() => collectCompactHistory(events, chatId), [events, chatId]);
  if (!stages.length) return null;
  return (
    <section className={styles.section}>
      <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={listId}
        onClick={() => setExpanded(!expanded)}>
        <MaterialIcon name={expanded ? "expand_more" : "chevron_right"} aria-hidden="true" />
        {t("contextCompact.records.title")}
        <span className={styles.count}>{stages.length}</span>
      </button>
      <ol id={listId} className={styles.list} hidden={!expanded}>
        {expanded && stages.map(({ key, event }) => {
          const completed = event.type === "compact.complete";
          const failed = event.type === "compact.failed";
          const status = failed ? t("contextCompact.records.failed")
            : completed ? t("contextCompact.records.completed") : t("contextCompact.records.started");
          const labels = [
            event.level === "l1_tools" ? t("topNav.usage.compactTools")
              : event.level === "summary" ? t("topNav.usage.compactSummary") : "",
            event.trigger === "manual" ? t("contextCompact.records.manual")
              : event.trigger === "auto" ? t("contextCompact.records.auto") : "",
            event.scope === "history" ? t("contextCompact.records.historyScope") : "",
          ].filter(Boolean);
          const before = event.estimatedTokens;
          const stats = [
            ...(typeof before === "number" && Number.isFinite(before) && before >= 0
              ? [t("contextCompact.records.before", { tokens: before.toLocaleString(locale) })] : []),
            ...(completed ? formatCompactStats(event, t) : []),
          ];
          const reason = failed && (event.error?.message || event.detail || event.error?.code);
          return (
            <li key={key}>
              <div className={styles.head}>
                <strong data-failed={failed}>{status}</strong>
                {event.timestamp ? <time dateTime={new Date(event.timestamp).toISOString()}>
                  {new Date(event.timestamp).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </time> : null}
              </div>
              {labels.length > 0 && <div>{labels.join(" · ")}</div>}
              {stats.length > 0 && <div>{stats.join(" · ")}</div>}
              {reason && <div>{reason}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

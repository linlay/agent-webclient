import React, { useEffect, useState } from "react";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { readWaitDescription, readWaitResult } from "@/shared/contracts/waitResult";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import styles from "./WaitCard.module.css";

export function waitRemainingSeconds(deadlineAt: number, now: number): number {
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

export function WaitCard({ node, now, active }: { node: TimelineNode; now?: number; active: boolean }) {
  const { t } = useI18n();
  const interaction = useTimelineInteraction();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const wait = node.toolWait;
  const terminal = Boolean(node.result) || ["success", "failed", "error", "canceled"].includes(node.status || "");
  const ticking = active && Boolean(wait) && !terminal;
  useEffect(() => {
    if (!ticking || now !== undefined) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking, now, wait?.deadlineAt]);
  // Only this invocation's own description is shown: the live wait event, then
  // the call arguments. node.description is the tool definition's model-facing text.
  const description = wait?.description?.trim() || readWaitDescription(node.argsText);
  const seconds = wait ? waitRemainingSeconds(wait.deadlineAt, now ?? clock) : 0;
  const fraction = wait ? Math.max(0, Math.min(1, (wait.deadlineAt - (now ?? clock)) / Math.max(1, wait.deadlineAt - wait.startedAt))) : 0;
  const failed = ["failed", "error"].includes(node.status || "");
  const { reason, continued } = readWaitResult(node.result?.text);
  const state = ticking ? "waiting"
    : continued ? "continued"
    : reason ? reason
    : failed ? "failed"
    : node.status === "canceled" ? "canceled"
    : terminal ? "finished" : "idle";
  const conditions = wait?.conditions || [];
  const conditionSummary = conditions.length
    ? `${conditions.filter(c => c.satisfied).length}/${conditions.length} · ${t(wait?.match === "all" ? "timeline.wait.all" : "timeline.wait.any")}`
    : "";
  // Steer only wakes a root-Run wait; a sub-task wait cannot be ended this way.
  const canContinue = ticking && !node.taskId && !interaction?.readOnly && Boolean(interaction?.continueWait && node.runId);
  const continueNow = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (pending || !canContinue) return;
    setPending(true);
    setError(false);
    try {
      // Stay pending after acceptance: the card leaves the waiting state only
      // when the server's tool.result arrives.
      if (!await interaction!.continueWait!(node.runId!)) throw new Error("Steer was not accepted");
    } catch {
      setPending(false);
      setError(true);
    }
  };
  return (
    <div className={styles.card} data-wait-state={state} data-continue-pending={pending || undefined}>
      <div className={styles.body}>
        <div className={styles.copy} title={[description, conditionSummary].filter(Boolean).join(" · ")}>
          <span className={styles.description}>{description || t("timeline.wait.idle")}</span>
        </div>
        <div className={styles.clock} data-can-continue={canContinue || undefined}>
          {ticking ? <div role="timer" aria-live="off" className={styles.time}
            title={[t(conditions.length ? "timeline.wait.maximum" : "timeline.wait.remaining"), conditionSummary].filter(Boolean).join(" · ")}>
            {seconds > 0
              ? <span className={styles.digits}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
              : <span className={styles.caption}>{t("timeline.wait.pending")}</span>}
          </div> : <span className={styles.caption} title={t(`timeline.wait.${state}`)}>{t(state === "steered" ? "timeline.wait.steeredShort" : `timeline.wait.${state}`)}</span>}
          {canContinue && <button type="button" className={styles.resume} disabled={pending} onClick={continueNow}>{t(pending ? "timeline.wait.resuming" : "timeline.wait.resume")}</button>}
        </div>
      </div>
      {error && ticking && <div className={styles.error} role="alert">{t("timeline.wait.error")}</div>}
      {ticking && <div className={styles.track} aria-hidden="true"><div className={styles.fill} style={{ transform: `scaleX(${fraction})` }} /></div>}
    </div>
  );
}

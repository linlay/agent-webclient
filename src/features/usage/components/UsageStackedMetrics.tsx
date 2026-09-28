import React from "react";
import { Tooltip } from "antd";
import type { AIUsageStats } from "@/shared/contracts/agentEvents";
import { useI18n } from "@/shared/i18n";
import { formatUsageNumber } from "../lib/usageMetrics";
import { buildUsageComposition, compositionPercent, compositionPercentLabel } from "../lib/usageComposition";
import styles from "./UsageContextControl.module.css";

type Segment = { key: string; label: string; value: number | undefined; color: string; hideLegend?: boolean };

const Composition: React.FC<{
  segments: Segment[];
  base: number | undefined;
  details: { label: string; value: number | undefined }[];
  label: string;
}> = ({ segments, base, details, label }) => {
  const percentages = segments.map(segment => compositionPercent(segment.value, base));
  // Inconsistent upstream totals must not produce overlapping or overflowing segments.
  const valid = percentages.reduce<number>((sum, value) => sum + (value ?? 0), 0) <= 100.000001;
  const description = details.map(row => `${row.label}: ${formatUsageNumber(row.value)}`).join("; ");
  return <Tooltip arrow={false} trigger={["hover", "focus"]} title={
    <div className={styles["usage-detail"]}>
      {details.map(row => <div key={row.label}><span>{row.label}</span><strong>{formatUsageNumber(row.value)}</strong></div>)}
    </div>
  }>
    <div className={styles["usage-composition"]} tabIndex={0} role="group" aria-label={`${label}: ${description}`}>
      <div className={styles["usage-composition-legend"]}>
        {segments.map((segment, index) => segment.hideLegend ? null : <div className="usage-metric" key={segment.key}>
          <i aria-hidden="true" style={{ background: segment.color }} />
          <span className="usage-metric-label">{segment.label}</span>
          <strong className="usage-metric-value">{compositionPercentLabel(percentages[index]) ?? formatUsageNumber(segment.value)}</strong>
        </div>)}
      </div>
      <div className={styles["usage-composition-track"]} aria-hidden="true">
        {segments.map((segment, index) => <span key={segment.key} data-segment={segment.key}
          style={{ background: segment.color, width: `${valid ? percentages[index] ?? 0 : 0}%` }} />)}
      </div>
    </div>
  </Tooltip>;
};

export const UsageStackedMetrics: React.FC<{ stats?: AIUsageStats }> = ({ stats }) => {
  const { t } = useI18n();
  const values = buildUsageComposition(stats);
  const label = (key: string) => t(`topNav.usage.metric.${key}`);
  const tokenLabel = (metric: string) => t("topNav.usage.metric.tokenCount", { metric });
  const token = (key: string) => tokenLabel(label(key));
  return <div className={`usage-metric-grid ${styles["usage-compositions"]}`}>
    <Composition label={label("total")} base={values.total} segments={[
      { key: "prompt", label: t("topNav.usage.legend.prompt"), value: values.prompt, color: "#22a06b" },
      { key: "output", label: t("topNav.usage.legend.completion"), value: values.output, color: "#3569f6" },
      { key: "reasoning", label: t("topNav.usage.legend.reasoning"), value: values.reasoning, color: "#9254de" },
    ]} details={[
      { label: token("total"), value: values.total },
      { label: token("prompt"), value: values.prompt },
      { label: token("completion"), value: values.completion },
      { label: token("includedReasoning"), value: values.reasoning },
      { label: tokenLabel(`${label("completion")} − ${label("reasoning")}`), value: values.output },
    ]} />
    <Composition label={label("cacheHit")} base={values.prompt} segments={[
      { key: "cacheHit", label: label("cacheHit"), value: values.hit, color: "#3569f6" },
      { key: "cacheMiss", label: label("cacheMiss"), value: values.miss, color: "var(--line-soft)", hideLegend: true },
    ]} details={[
      { label: token("prompt"), value: values.prompt },
      { label: token("cacheHit"), value: values.hit },
      { label: token("cacheMiss"), value: values.miss },
    ]} />
  </div>;
};

import { useEffect, useMemo, useRef } from "react";
import type { EChartsOption, EChartsType } from "echarts";
import { useI18n } from "@/shared/i18n";
import { BusyInk } from "@/shared/ui/BusyInk";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./MarkdownECharts.module.css";

const DEFAULT_ECHARTS_HEIGHT = 320;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseEChartsOption(text: string): EChartsOption {
  const source = text.trim();
  if (!source) throw new Error("ECharts option is empty.");
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed)) throw new Error("ECharts option must be a JSON object.");
  return parsed as EChartsOption;
}

export const MarkdownECharts: React.FC<{
  code: string;
  streamStatus?: "loading" | "done";
}> = ({ code, streamStatus }) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  const payload = useMemo(() => {
    try {
      return { value: parseEChartsOption(code), error: null };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Invalid ECharts JSON.",
      };
    }
  }, [code]);

  useEffect(() => {
    if (!payload.value || !containerRef.current) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    const container = containerRef.current;

    void import("echarts").then((echartsModule) => {
      if (disposed) return;

      const chart =
        chartRef.current ||
        echartsModule.init(
          container,
          document.documentElement.dataset.theme === "dark" ? "dark" : null,
        );
      chartRef.current = chart;
      chart.setOption(payload.value, true);

      resizeObserver = new ResizeObserver(() => {
        chart.resize();
      });
      resizeObserver.observe(container);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
    };
  }, [payload.value]);

  useEffect(
    () => () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    },
    [],
  );

  if (!payload.value) {
    // 流式接收中 JSON 天然不完整，用墨流占位而不是报错盒子；
    // 只有流真正结束仍解析不出来才算失败。
    if (streamStatus === "loading") {
      return (
        <div
          className={["markdown-echarts", styles.busy].filter(Boolean).join(" ")}
          style={{ height: DEFAULT_ECHARTS_HEIGHT }}
          role="status"
          aria-busy="true"
        >
          <BusyInk />
          <span className={styles.busyLabel}>
            <MaterialIcon name="bar_chart" />
            {t("markdown.echartsReceiving")}
          </span>
        </div>
      );
    }
    return (
      <div className="markdown-echarts markdown-echarts-error">
        {t("markdown.echartsParseFailed", { detail: payload.error })}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="markdown-echarts"
      style={{ height: DEFAULT_ECHARTS_HEIGHT }}
    ></div>
  );
};

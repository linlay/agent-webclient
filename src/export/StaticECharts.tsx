import React, { useEffect, useMemo, useRef, useState } from "react";
import { ECHARTS_CDN_ASSET } from "./cdnAssets";
import { DiagramFallback, DiagramLoading } from "./DiagramPlaceholder";
import { loadCdnScript } from "./loadCdnScript";
import styles from "./ConversationExportDocument.module.css";

type EChartsInstance = {
  dispose(): void;
  resize(): void;
  setOption(option: Record<string, unknown>): void;
};

type EChartsGlobal = {
  init(element: HTMLElement): EChartsInstance;
};

type EChartsRenderState = "loading" | "ready" | "failed";

export const StaticECharts: React.FC<{ source: string }> = ({ source }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const option = useMemo(() => parseObject(source), [source]);
  const [renderState, setRenderState] = useState<EChartsRenderState>(() =>
    option ? "loading" : "failed",
  );

  useEffect(() => {
    if (!option) return undefined;
    let active = true;
    let chart: EChartsInstance | null = null;
    let resizeObserver: ResizeObserver | null = null;
    void loadCdnScript(ECHARTS_CDN_ASSET)
      .then(() => {
        if (!active || !containerRef.current) return;
        const echarts = (globalThis as typeof globalThis & { echarts?: EChartsGlobal })
          .echarts;
        if (!echarts) throw new Error("echarts_missing");
        chart = echarts.init(containerRef.current);
        chart.setOption(option);
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => chart?.resize());
          resizeObserver.observe(containerRef.current);
        }
        setRenderState("ready");
      })
      .catch(() => {
        if (active) setRenderState("failed");
      });
    return () => {
      active = false;
      resizeObserver?.disconnect();
      chart?.dispose();
    };
  }, [option]);

  if (renderState === "failed") {
    return <DiagramFallback language="echarts" source={source} />;
  }
  return (
    <div className={styles.chartFrame}>
      <div
        className={styles.chart}
        ref={containerRef}
        role="img"
        aria-busy={renderState === "loading"}
      />
      {renderState === "loading" ? (
        <DiagramLoading className={styles.diagramLoadingOverlay} />
      ) : null}
    </div>
  );
};

function parseObject(source: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(source);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

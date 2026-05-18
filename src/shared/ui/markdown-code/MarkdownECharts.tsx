import { useEffect, useMemo, useRef } from "react";
import type { EChartsType } from "echarts";

const DEFAULT_ECHARTS_HEIGHT = 320;

// json 解析
const looseJsonParse = (text: string) => {
  if (!text) return {};
  return Function(`"use strict";return (${text})`)();
};

export const MarkdownECharts: React.FC<{
  code: string;
  streamStatus?: "loading" | "done";
}> = ({ code, streamStatus }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  const payload = useMemo(() => {
    try {
      return { value: looseJsonParse(code), error: null };
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
    return (
      <div className="markdown-echarts markdown-echarts-error">
        {streamStatus === "loading"
          ? "图表配置接收中…"
          : `ECharts 配置解析失败：${payload.error}`}
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

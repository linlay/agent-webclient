import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { BusyInk } from "../BusyInk";
import { MaterialIcon } from "../MaterialIcon";
import { UiButton } from "../UiButton";
import { useI18n } from "@/shared/i18n";

type RenderState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

type ReadyRenderState = Extract<RenderState, { status: "ready" }>;
type VisibleRenderState =
  | RenderState
  | { status: "ready"; svg: string; stale: boolean };

export const MERMAID_ZOOM_DEFAULT = 1;
export const MERMAID_ZOOM_MIN = 0.5;
export const MERMAID_ZOOM_MAX = 3;
const MERMAID_ZOOM_STEP = 0.25;
const MERMAID_STREAM_RENDER_DELAY_MS = 400;
export const MERMAID_SECURITY_CONFIG = Object.freeze({
  securityLevel: "strict" as const,
  suppressErrorRendering: true,
});

type MermaidZoomAction = "in" | "out" | "reset";

type MermaidDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  dragged: boolean;
};

export function getNextMermaidZoom(
  currentZoom: number,
  action: MermaidZoomAction,
): number {
  if (action === "reset") return MERMAID_ZOOM_DEFAULT;
  const nextZoom =
    currentZoom + (action === "in" ? MERMAID_ZOOM_STEP : -MERMAID_ZOOM_STEP);
  return Math.min(MERMAID_ZOOM_MAX, Math.max(MERMAID_ZOOM_MIN, nextZoom));
}

export function isMermaidDragDistance(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) > 4;
}

export function getMermaidRenderDelay(
  streamStatus?: "loading" | "done",
): number {
  return streamStatus === "loading" ? MERMAID_STREAM_RENDER_DELAY_MS : 0;
}

export function getVisibleMermaidRenderState(
  state: RenderState,
  lastReadyState: ReadyRenderState | null,
  streamStatus?: "loading" | "done",
): VisibleRenderState {
  if (state.status === "ready") return state;
  if (state.status === "empty" || !lastReadyState) return state;
  // 手上已有旧图时，loading 一律继续显示旧图并标 stale：流式刷新、收尾重画、
  // 主题切换都走这条路，中途不再插一帧墨流盒。
  if (state.status === "loading") return { ...lastReadyState, stale: true };
  // error 只在流未结束时兜底，流结束必须如实报错。
  if (streamStatus === "loading") return { ...lastReadyState, stale: true };
  return state;
}

export function getMermaidRenderConfig(theme: "default" | "dark") {
  return {
    startOnLoad: false,
    ...MERMAID_SECURITY_CONFIG,
    flowchart: {
      htmlLabels: true,
      curve: "basis" as const,
    },
    theme,
  };
}

function getMermaidTheme(): "default" | "dark" {
  if (typeof document === "undefined") return "default";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "default";
}

export const MarkdownMermaid: React.FC<{
  code: string;
  streamStatus?: "loading" | "done";
}> = ({ code, streamStatus }) => {
  const { t } = useI18n();
  const reactId = useId();
  const renderBaseId = useRef(
    `markdown-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
  );
  const renderCount = useRef(0);
  const dragState = useRef<MermaidDragState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastReadyState = useRef<ReadyRenderState | null>(null);
  // 已成功出图那份源码的「主题 + 源码」指纹，用来判断一次 effect 重跑要不要真的重画。
  const renderedKeyRef = useRef<string | null>(null);
  // 初值必须和 effect 里的判空口径一致：否则空的 fence 会先渲染一帧墨流盒、
  // 再被 effect 改成 empty 文案盒，看起来就是「闪一下」。
  const [state, setState] = useState<RenderState>(() =>
    code.trim() ? { status: "loading" } : { status: "empty" },
  );
  const [theme, setTheme] = useState<"default" | "dark">(getMermaidTheme);
  const [zoom, setZoom] = useState(MERMAID_ZOOM_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);

  const updateZoom = (action: MermaidZoomAction) => {
    setZoom((currentZoom) => getNextMermaidZoom(currentZoom, action));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current || event.button !== 0) return;
    const viewport = viewportRef.current;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      dragged: false,
    };
    viewport.setPointerCapture(event.pointerId);
    setIsDragging(false);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const currentDrag = dragState.current;
    if (!currentDrag || !viewportRef.current) return;
    const viewport = viewportRef.current;
    const deltaX = event.clientX - currentDrag.startX;
    const deltaY = event.clientY - currentDrag.startY;

    if (
      !currentDrag.dragged &&
      isMermaidDragDistance(
        currentDrag.startX,
        currentDrag.startY,
        event.clientX,
        event.clientY,
      )
    ) {
      currentDrag.dragged = true;
      setIsDragging(true);
    }

    if (!currentDrag.dragged) return;
    viewport.scrollLeft = currentDrag.scrollLeft - deltaX;
    viewport.scrollTop = currentDrag.scrollTop - deltaY;
  };

  const handlePointerUp = () => {
    const currentDrag = dragState.current;
    if (!currentDrag || !viewportRef.current) return;
    const didDrag = currentDrag.dragged;
    viewportRef.current.releasePointerCapture(currentDrag.pointerId);
    dragState.current = null;
    setIsDragging(false);
    if (!didDrag) updateZoom("in");
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !viewportRef.current) return;
    viewportRef.current.releasePointerCapture(event.pointerId);
    dragState.current = null;
    setIsDragging(false);
  };

  useEffect(() => {
    if (typeof document === "undefined") return;

    const observer = new MutationObserver(() => {
      setTheme(getMermaidTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const source = code.trim();
    if (!source) {
      lastReadyState.current = null;
      renderedKeyRef.current = null;
      // 返回原引用时 React 会 bail out，省掉一次无视觉变化的空重渲染。
      setState((current) =>
        current.status === "empty" ? current : { status: "empty" },
      );
      return;
    }

    // 指纹没变却重跑，说明只是 streamStatus 之类的无关依赖在抖（流结束那一下、
    // 英文文案 `t` 换引用等）：直接复用已画好的图，不闪回墨流、也不重复 render。
    const renderKey = `${theme}\u0000${source}`;
    if (renderedKeyRef.current === renderKey && lastReadyState.current) {
      setState(lastReadyState.current);
      return;
    }

    let disposed = false;
    const renderDelay = getMermaidRenderDelay(streamStatus);
    setState((current) =>
      current.status === "loading" ? current : { status: "loading" },
    );

    const renderTimer = window.setTimeout(() => {
      void import("mermaid")
        .then(async (module) => {
          if (disposed) return;

          const mermaid = module.default;
          mermaid.initialize(getMermaidRenderConfig(theme));
          const parseResult = await mermaid.parse(source, {
            suppressErrors: true,
          });
          if (!parseResult) {
            throw new Error(t("mermaid.status.parseFailed"));
          }

          renderCount.current += 1;
          const result = await mermaid.render(
            `${renderBaseId.current}-${renderCount.current}`,
            source,
          );

          if (!disposed) {
            const readyState: ReadyRenderState = {
              status: "ready",
              svg: result.svg,
            };
            lastReadyState.current = readyState;
            renderedKeyRef.current = renderKey;
            setState(readyState);
          }
        })
        .catch((error: unknown) => {
          if (disposed) return;
          if (streamStatus === "loading") {
            setState((current) =>
              current.status === "loading" ? current : { status: "loading" },
            );
            return;
          }
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : t("mermaid.status.renderFailed"),
          });
        });
    }, renderDelay);

    return () => {
      disposed = true;
      window.clearTimeout(renderTimer);
    };
  }, [code, streamStatus, theme, t]);

  const visibleState = getVisibleMermaidRenderState(
    state,
    lastReadyState.current,
    streamStatus,
  );
  const isStale = "stale" in visibleState;

  if (visibleState.status === "ready") {
    return (
      <div
        className={`markdown-mermaid ${isStale ? "is-stale" : ""}`.trim()}
        data-mermaid-status={isStale ? "stale" : "ready"}
      >
        <div className="markdown-mermaid-toolbar">
          {isStale && (
            <span className="markdown-mermaid-render-status">
              {t("mermaid.status.updating")}
            </span>
          )}
          <span className="markdown-mermaid-zoom">{Math.round(zoom * 100)}%</span>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("mermaid.zoom.outAria")}
            title={t("mermaid.zoom.out")}
            disabled={zoom <= MERMAID_ZOOM_MIN}
            onClick={() => updateZoom("out")}
          >
            <MaterialIcon name="zoom_out" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("mermaid.zoom.resetAria")}
            title={t("mermaid.zoom.reset")}
            disabled={zoom === MERMAID_ZOOM_DEFAULT}
            onClick={() => updateZoom("reset")}
          >
            <MaterialIcon name="fit_screen" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("mermaid.zoom.inAria")}
            title={t("mermaid.zoom.in")}
            disabled={zoom >= MERMAID_ZOOM_MAX}
            onClick={() => updateZoom("in")}
          >
            <MaterialIcon name="zoom_in" />
          </UiButton>
        </div>
        <div
          ref={viewportRef}
          className={`markdown-mermaid-viewport ${isDragging ? "is-dragging" : ""}`}
          role="button"
          tabIndex={0}
          aria-label={t("mermaid.viewport.ariaLabel")}
          title={t("mermaid.viewport.title")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            updateZoom("in");
          }}
        >
          <span
            className="markdown-mermaid-svg"
            style={
              {
                "--mermaid-zoom": String(zoom),
              } as CSSProperties
            }
            // This sink only receives SVG returned by Mermaid under the frozen
            // strict security configuration, which applies Mermaid's DOMPurify pass.
            dangerouslySetInnerHTML={{ __html: visibleState.svg }}
          />
        </div>
      </div>
    );
  }

  // loading 与 empty 是两件事：loading 已经拿到源码、只是在等 mermaid 出图，用墨流占位
  // （与 `MarkdownECharts` 的接收态同一视觉语言）；empty 是连内容都还没有，只用一句文案。
  if (visibleState.status === "loading") {
    return (
      <div
        className="markdown-mermaid markdown-mermaid-busy"
        data-mermaid-status="loading"
        role="status"
        aria-busy="true"
      >
        <BusyInk />
        <span className="markdown-mermaid-busy-label">
          <MaterialIcon name="hub" />
          {t("mermaid.status.rendering")}
        </span>
      </div>
    );
  }

  const text =
    visibleState.status === "error"
      ? t("mermaid.status.failedWithDetail", {
          detail: visibleState.message,
        })
      : t("mermaid.status.receiving");

  return (
    <div
      className="markdown-mermaid markdown-mermaid-status"
      data-mermaid-status={visibleState.status}
    >
      {text}
    </div>
  );
};

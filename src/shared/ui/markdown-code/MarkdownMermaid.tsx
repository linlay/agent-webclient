import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
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
  if (
    streamStatus === "loading" &&
    state.status !== "empty" &&
    lastReadyState
  ) {
    return { ...lastReadyState, stale: true };
  }
  return state;
}

export function getMermaidRenderConfig(theme: "default" | "dark") {
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    suppressErrorRendering: true,
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
  const [state, setState] = useState<RenderState>({ status: "loading" });
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

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
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
      setState({ status: "empty" });
      return;
    }

    let disposed = false;
    const renderDelay = getMermaidRenderDelay(streamStatus);
    setState({ status: "loading" });

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
            setState(readyState);
          }
        })
        .catch((error: unknown) => {
          if (disposed) return;
          if (streamStatus === "loading") {
            setState({ status: "loading" });
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

  if (visibleState.status === "ready") {
    return (
      <div
        className={`markdown-mermaid ${"stale" in visibleState ? "is-stale" : ""}`.trim()}
      >
        <div className="markdown-mermaid-toolbar">
          {"stale" in visibleState && (
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
            dangerouslySetInnerHTML={{ __html: visibleState.svg }}
          />
        </div>
      </div>
    );
  }

  const text =
    visibleState.status === "empty" || streamStatus === "loading"
      ? t("mermaid.status.receiving")
      : visibleState.status === "error"
        ? t("mermaid.status.failedWithDetail", {
            detail: visibleState.message,
          })
        : t("mermaid.status.rendering");

  return <div className="markdown-mermaid markdown-mermaid-status">{text}</div>;
};

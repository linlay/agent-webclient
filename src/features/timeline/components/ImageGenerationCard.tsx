import React, { useEffect, useRef, useState } from "react";
import type { TimelineNode } from "../lib/timelineState";
import { buildImageGenerationDisplay } from "../lib/imageGenerationDisplay";
import { BusyInk } from "@/shared/ui/BusyInk";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { ToolPill } from "./ToolPill";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import styles from "./ImageGenerationCard.module.css";

export function ImageGenerationCard({ nodes }: { nodes: TimelineNode[] }) {
  const { t } = useI18n();
  const interaction = useTimelineInteraction();
  const chatId = interaction?.surfaceContext?.chatId ?? "";
  const calls = nodes.map((node) => ({
    node,
    display: buildImageGenerationDisplay(node, interaction?.getRunStatus?.(node) ?? {
      active: interaction?.conversationActive ?? false,
    }),
  }));
  const gridRef = useRef<HTMLDivElement>(null);
  const gridId = React.useId();
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  const slotCount = calls.reduce(
    (count, call) => count + call.display.count,
    0,
  );
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const updateEdges = () => {
      const left = grid.scrollLeft > 1;
      const right = grid.scrollWidth - grid.clientWidth - grid.scrollLeft > 1;
      setScrollEdges((current) =>
        current.left === left && current.right === right
          ? current
          : { left, right },
      );
    };
    updateEdges();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateEdges);
    observer?.observe(grid);
    grid.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      observer?.disconnect();
      grid.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [slotCount, chatId]);
  const scrollImages = (direction: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.scrollBy({
      left: direction * (grid.clientWidth + 14),
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  return (
    <section className={styles.root} aria-label={t("timeline.image.title")}>
      <div className={styles.details}>
        {nodes.map((node) => (
          <ToolPill key={node.id} node={node} />
        ))}
      </div>
      <div className={styles.carousel}>
        <div
          ref={gridRef}
          id={gridId}
          className={`${styles.grid} ${SCROLLBAR_THIN_CLASS_NAME}`}
          tabIndex={0}
          role="region"
          aria-label={t("timeline.image.title")}
        >
          {calls.flatMap(({ node, display }) =>
            Array.from({ length: display.count }, (_, index) => {
              const image = display.images.find(
                (item) => item.index === index && item.url,
              );
              const showImage = image && display.status === "success";
              return (
                <div
                  key={`${node.runId || ""}:${node.toolId || node.id}:${index}`}
                  className={`${styles.tile} ${display.busy ? "" : "tw:bg-bg-base"}`}
                  data-tool-id={node.toolId || node.id}
                  data-image-index={index}
                  data-image-status={showImage ? "success" : display.status}
                >
                  {showImage ? (
                    interaction?.renderAttachment?.({
                      name: image.name, url: image.url, mimeType: image.mimeType, size: image.sizeBytes,
                    }, { displayMode: "preview", generatedImage: image }) ??
                    <div className={styles.placeholder} role="status">{t("timeline.image.missing")}</div>
                  ) : (
                    <>
                      <div
                        className={styles.placeholder}
                        role="status"
                        aria-busy={display.busy}
                      >
                        <MaterialIcon name="image" />
                        <span>
                          {t(
                            `timeline.image.${display.status === "success" ? "missing" : display.status}`,
                          )}
                        </span>
                        {display.count > 1 && (
                          <small>
                            {index + 1} / {display.count}
                          </small>
                        )}
                      </div>
                      {display.busy && <BusyInk />}
                    </>
                  )}
                </div>
              );
            }),
          )}
        </div>
        {scrollEdges.left && (
          <button
            type="button"
            className={`${styles.scrollArrow} ${styles.scrollLeft}`}
            aria-label={t("timeline.image.previous")}
            title={t("timeline.image.previous")}
            aria-controls={gridId}
            onClick={() => scrollImages(-1)}
          >
            <MaterialIcon name="chevron_left" />
          </button>
        )}
        {scrollEdges.right && (
          <button
            type="button"
            className={`${styles.scrollArrow} ${styles.scrollRight}`}
            aria-label={t("timeline.image.next")}
            title={t("timeline.image.next")}
            aria-controls={gridId}
            onClick={() => scrollImages(1)}
          >
            <MaterialIcon name="chevron_right" />
          </button>
        )}
      </div>
    </section>
  );
}

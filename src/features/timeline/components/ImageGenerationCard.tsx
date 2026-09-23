import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineNode } from "../lib/timelineState";
import {
  buildImageGenerationDisplay,
  type GeneratedImage,
} from "../lib/imageGenerationDisplay";
import { useOptionalAppContext } from "@/app/state/provider";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { buildResourceViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { downloadArtifactResource } from "@/features/artifacts/lib/artifactResourceRuntime";
import {
  decodeNativeResourceRelativePath,
  useOpenTarget,
  type OpenTargetIntent,
} from "@/features/surfaces/openTarget";
import { classifyResourceUrl } from "@/shared/data";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { ToolPill } from "./ToolPill";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import styles from "./ImageGenerationCard.module.css";

type Surface = { chatId: string; agentKey?: string; teamChat?: boolean };

function GeneratedImageTile({
  image,
  surface,
}: {
  image: GeneratedImage;
  surface: Surface;
}) {
  const { t } = useI18n();
  const message = useAppMessage();
  const openTarget = useOpenTarget();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  const source = useAuthenticatedResourceUrl(image.url, surface.chatId, {
    teamChat: surface.teamChat,
    refreshKey,
  });
  const failed = Boolean(
    source.error || (source.url && failedUrl === source.url),
  );
  const loaded = Boolean(source.url && loadedUrl === source.url && !failed);
  const target = useMemo(
    () => buildResourceViewerTarget({ ...image, contentKind: "image" }),
    [image],
  );
  const open = () => {
    if (!target) return;
    const common = {
      version: 1 as const,
      chatId: surface.chatId,
      agentKey: surface.agentKey,
      resourceTarget: target,
    };
    const resource = classifyResourceUrl(target.url, surface.chatId);
    if (image.artifactId && resource.kind === "chat") {
      // Generated images can be flat Chat resources; use the same editor as
      // artifacts while retaining reference semantics (save as a new artifact).
      for (const intent of [
        { ...common, kind: "artifact", artifactId: image.artifactId },
        { ...common, kind: "reference", referenceId: image.artifactId },
      ] satisfies OpenTargetIntent[]) {
        if (
          decodeNativeResourceRelativePath(resource.resourceKey, intent.kind)
        ) {
          openTarget(intent);
          return;
        }
      }
    }
    openTarget({ ...common, kind: "resource", file: target.url });
  };
  const targetId = React.useId();
  const contextTarget = {
    targetId: `generated-image:${targetId}`,
    kind: "chat-resource" as const,
    name: image.name,
    mediaType: "image" as const,
    handlers: {
      ...(target ? { "preview-resource": open } : {}),
      "download-resource": () => {
        void downloadArtifactResource(
          image.url,
          image.name,
          surface.chatId,
          undefined,
          surface.teamChat,
        ).catch(() => {
          void message.error(t("timeline.image.downloadFailed"));
        });
      },
    },
  };
  const contextRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);
  return (
    <div ref={contextRef} className={styles.image}>
      <button
        type="button"
        className={styles.open}
        onClick={open}
        disabled={!target || !loaded}
        aria-label={t("attachments.action.view") + " " + image.name}
      >
        {source.url && (
          <img
            key={`${source.url}:${refreshKey}`}
            src={source.url}
            alt={image.name}
            className={loaded ? styles.loaded : styles.loadingImage}
            onLoad={() => setLoadedUrl(source.url)}
            onError={() => setFailedUrl(source.url)}
          />
        )}
      </button>
      {!loaded && (
        <div className={styles.overlay} role="status">
          <MaterialIcon name="image" />
          <span>
            {t(failed ? "timeline.image.loadFailed" : "timeline.image.loading")}
          </span>
          {failed && (
            <button
              type="button"
              className={styles.retry}
              onClick={() => {
                setFailedUrl("");
                setLoadedUrl("");
                setRefreshKey((value) => value + 1);
              }}
            >
              {t("timeline.image.reload")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ImageGenerationCard({ nodes }: { nodes: TimelineNode[] }) {
  const { t } = useI18n();
  const context = useOptionalAppContext();
  const interaction = useTimelineInteraction();
  const runtime = context
    ? resolveMainChatRuntime(
        context.state,
        context.activeQuerySessionRequestIdRef,
        context.querySessionsRef,
      )
    : null;
  const chatId =
    interaction?.surfaceContext?.chatId ?? context?.state.chatId ?? "";
  const chat = context?.state.chats.find((item) => item.chatId === chatId);
  const surface: Surface = interaction?.surfaceContext || {
    chatId,
    agentKey: runtime?.agentKey,
    teamChat: Boolean(
      chat?.teamId || chat?.owner?.kind === "orchestrated-team",
    ),
  };
  const calls = nodes.map((node) => {
    const terminal = context?.state.events.find(
      (event) =>
        node.runId &&
        event.runId === node.runId &&
        (event.type === "run.complete" ||
          event.type === "run.error" ||
          event.type === "run.cancel"),
    )?.type;
    const sameRun = !node.runId || runtime?.runId === node.runId;
    const active =
      interaction?.conversationActive ?? Boolean(sameRun && runtime?.running);
    return {
      node,
      display: buildImageGenerationDisplay(node, {
        active,
        recovering: Boolean(
          active && runtime?.hasActiveRun && !runtime.streaming,
        ),
        terminal:
          terminal === "run.complete" ||
          terminal === "run.error" ||
          terminal === "run.cancel"
            ? terminal
            : undefined,
      }),
    };
  });
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
                    <GeneratedImageTile
                      key={`${chatId}:${image.url}`}
                      image={image}
                      surface={surface}
                    />
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
                      {display.busy && (
                        <>
                          <div className={styles["busy-ink1"]}></div>
                          <div className={styles["busy-ink2"]}></div>
                        </>
                      )}
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

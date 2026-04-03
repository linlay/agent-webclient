import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "../../context/AppContext";
import type { PublishedArtifact } from "../../context/types";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { AttachmentCard } from "../common/AttachmentCard";

/**
 * 需求
 * 1. 仅在有数据时才展示
 * 2. 可点击展开全部 artifact 列表，默认不展开，不展开时只展示一行
 * 3. 每新增一个 artifact，展开3秒，然后自动收起
 */
function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatMimeLabel(mimeType: string): string {
  const value = String(mimeType || "").trim();
  if (!value) return "FILE";
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0) return value.toUpperCase();
  return value
    .slice(slashIndex + 1)
    .replace(/[-_.]+/g, " ")
    .toUpperCase();
}

function formatArtifactTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ArtifactSummaryView {
  artifacts: PublishedArtifact[];
  latestArtifact: PublishedArtifact | null;
  countText: string;
  latestSummaryText: string;
}

export function buildArtifactSummaryView(
  artifacts: PublishedArtifact[],
): ArtifactSummaryView {
  const orderedArtifacts = [...artifacts].reverse();
  const latestArtifact = orderedArtifacts[0] || null;
  const latestSummaryText = latestArtifact
    ? `${latestArtifact.artifact.name} · ${formatBytes(latestArtifact.artifact.sizeBytes)}`
    : "";

  return {
    artifacts: orderedArtifacts,
    latestArtifact,
    countText: `${orderedArtifacts.length} 个文件`,
    latestSummaryText,
  };
}

export const ArtifactPanel: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const summary = useMemo(
    () => buildArtifactSummaryView(state.artifacts),
    [state.artifacts],
  );
  const listRef = useRef<HTMLUListElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const artifactListId = "floating-artifact-list";

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    let frameId = 0;

    const measureOverflow = () => {
      frameId = 0;
      const items = Array.from(
        list.querySelectorAll<HTMLElement>(".artifact-item"),
      );

      if (items.length <= 1) {
        setHasOverflow(false);
        return;
      }

      const firstRowTop = items[0]?.offsetTop ?? 0;
      const wrapped = items.some((item) => item.offsetTop > firstRowTop + 1);
      setHasOverflow(wrapped);
    };

    const scheduleMeasure = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(measureOverflow);
    };

    scheduleMeasure();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure();
      });
      resizeObserver.observe(list);
      Array.from(list.children).forEach((child) =>
        resizeObserver?.observe(child),
      );
    }

    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [summary.artifacts]);

  if (state.artifacts.length === 0) return null;

  const handleToggleExpanded = () => {
    if (state.artifactAutoCollapseTimer) {
      window.clearTimeout(state.artifactAutoCollapseTimer);
      dispatch({ type: "SET_ARTIFACT_AUTO_COLLAPSE_TIMER", timer: null });
    }
    dispatch({
      type: "SET_ARTIFACT_EXPANDED",
      expanded: !state.artifactExpanded,
    });
    dispatch({
      type: "SET_ARTIFACT_MANUAL_OVERRIDE",
      override: !state.artifactExpanded,
    });
  };

  return (
    <div
      className={`floating-artifact ${state.artifactExpanded ? "is-expanded" : ""}`}
      id="floating-artifact"
    >
      {hasOverflow ? (
        <div className="artifact-actions">
          <UiButton
            className="artifact-toggle"
            variant="ghost"
            size="sm"
            aria-expanded={state.artifactExpanded}
            aria-controls={artifactListId}
            onClick={handleToggleExpanded}
          >
            <span>
              {state.artifactExpanded ? "收起" : `展开 ${summary.countText}`}
            </span>
            <span className="artifact-chevron" aria-hidden="true">
              <MaterialIcon
                name={
                  state.artifactExpanded
                    ? "keyboard_arrow_down"
                    : "keyboard_arrow_up"
                }
              />
            </span>
          </UiButton>
        </div>
      ) : null}
      <ul className="artifact-list" id={artifactListId} ref={listRef}>
        {summary.artifacts.map((item) => {
          const artifact = item.artifact;
          const subtitle = [
            formatMimeLabel(artifact.mimeType),
            formatBytes(artifact.sizeBytes),
            formatArtifactTimestamp(item.timestamp),
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li key={item.artifactId} className="artifact-item">
              <a
                className="artifact-link"
                href={artifact.url}
                target="_blank"
                rel="noreferrer"
                title={artifact.name}
              >
                <AttachmentCard
                  attachment={artifact}
                  variant="composer"
                  displayMode="file"
                  density="compact"
                  subtitle={subtitle}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

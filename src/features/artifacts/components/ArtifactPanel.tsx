import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { PublishedArtifact } from "@/app/state/types";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { Flex } from "antd";

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const artifactDrawerId = "right-sidebar";
  const drawerOpen =
    state.artifactExpanded && state.artifactManualOverride === true;

  useEffect(() => {
    const panel = panelRef.current;
    const list = listRef.current;
    if (!panel || !list) return undefined;

    let frameId = 0;

    const measureOverflow = () => {
      frameId = 0;
      setHasOverflow(list.scrollWidth > list.clientWidth + 1);
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
      resizeObserver.observe(panel);
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
      expanded: !drawerOpen,
    });
    dispatch({
      type: "SET_ARTIFACT_MANUAL_OVERRIDE",
      override: !drawerOpen,
    });
  };

  return (
    <div className="floating-artifact" ref={panelRef}>
      <ul
        className={`artifact-list ${isCollapsed ? "is-collapsed" : ""}`}
        ref={listRef}
      >
        {summary.artifacts.map((item) => {
          const artifact = item.artifact;
          return (
            <li key={item.artifactId} className="artifact-item">
              <AttachmentCard
                attachment={artifact}
                variant="composer"
                displayMode="file"
                density="compact"
                subtitle={formatBytes(artifact.sizeBytes)}
              />
            </li>
          );
        })}
      </ul>
      <Flex
        className="artifact-actions"
        data-collapse={isCollapsed}
        align="center"
      >
        {hasOverflow && (
          <UiButton
            className="artifact-btn-expand"
            variant="ghost"
            size="sm"
            aria-expanded={drawerOpen}
            aria-controls={artifactDrawerId}
            onClick={handleToggleExpanded}
          >
            <span>{drawerOpen ? "收起" : "查看全部"}</span>
          </UiButton>
        )}
        <UiButton
          className="artifact-btn-collapse"
          data-collapse={isCollapsed}
          variant="ghost"
          size="sm"
          iconOnly
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <MaterialIcon name="keyboard_arrow_down" />
        </UiButton>
      </Flex>
    </div>
  );
};

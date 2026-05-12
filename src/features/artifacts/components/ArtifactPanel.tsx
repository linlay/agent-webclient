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
  const summary = useMemo(
    () => buildArtifactSummaryView(state.artifacts),
    [state.artifacts],
  );
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (state.artifacts.length === 0) return null;

  return isCollapsed ? (
    <div className="floating-artifact" ref={panelRef}>
      <ul className="artifact-list" ref={listRef}>
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
      <Flex className="artifact-actions" align="stretch">
        <UiButton
          variant="ghost"
          size="sm"
          iconOnly
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <MaterialIcon name="close" />
        </UiButton>
      </Flex>
    </div>
  ) : null;
};

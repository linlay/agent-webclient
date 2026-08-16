import React, { useMemo, useState } from "react";
import { useAppState } from "@/app/state/AppContext";
import type { PublishedArtifact } from "@/app/state/types";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { Flex } from "antd";
import type { TranslateParams } from "@/shared/i18n";
import { useI18n } from "@/shared/i18n";

type Translate = (key: string, params?: TranslateParams) => string;

const FLOATING_ARTIFACT_CLASS_NAME =
  "floating-artifact tw:relative tw:m-0 tw:flex tw:w-full tw:flex-row tw:items-stretch tw:gap-1 tw:overflow-hidden tw:border-0 tw:bg-transparent tw:shadow-none";

const ARTIFACT_LIST_CLASS_NAME =
  "artifact-list tw:m-0 tw:flex tw:list-none tw:flex-nowrap tw:items-stretch tw:gap-1 tw:p-0";

const ARTIFACT_ITEM_CLASS_NAME = "artifact-item tw:list-none";

const ARTIFACT_ACTIONS_CLASS_NAME = "artifact-actions";

const ARTIFACT_ACTION_BUTTON_CLASS_NAME = "tw:text-text-muted";

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
  t: Translate,
): ArtifactSummaryView {
  const orderedArtifacts = [...artifacts].reverse();
  const latestArtifact = orderedArtifacts[0] || null;
  const latestSummaryText = latestArtifact
    ? `${latestArtifact.artifact.name} · ${formatBytes(latestArtifact.artifact.sizeBytes)}`
    : "";

  return {
    artifacts: orderedArtifacts,
    latestArtifact,
    countText: t("artifactPanel.count", { count: orderedArtifacts.length }),
    latestSummaryText,
  };
}

function handleFloatingArtifactWheel(event: React.WheelEvent<HTMLDivElement>) {
  const panel = event.currentTarget;
  const maxScrollLeft = panel.scrollWidth - panel.clientWidth;
  if (maxScrollLeft <= 0) return;

  const scrollDelta = event.deltaY || event.deltaX;
  if (scrollDelta === 0) return;

  const scrollLeft = panel.scrollLeft;
  if (
    (scrollDelta < 0 && scrollLeft <= 0) ||
    (scrollDelta > 0 && scrollLeft >= maxScrollLeft)
  ) {
    return;
  }

  event.preventDefault();
  panel.scrollLeft =
    scrollDelta < 0
      ? Math.max(0, scrollLeft + scrollDelta)
      : Math.min(maxScrollLeft, scrollLeft + scrollDelta);
}

export const ArtifactPanel: React.FC = () => {
  const state = useAppState();
  const { t } = useI18n();
  const summary = useMemo(
    () => buildArtifactSummaryView(state.artifacts, t),
    [state.artifacts, t],
  );
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (state.artifacts.length === 0) return null;

  return isCollapsed ? (
    <div
      className={FLOATING_ARTIFACT_CLASS_NAME}
      onWheel={handleFloatingArtifactWheel}
    >
      <ul className={ARTIFACT_LIST_CLASS_NAME}>
        {summary.artifacts.map((item) => {
          const artifact = item.artifact;
          return (
            <li key={item.artifactId} className={ARTIFACT_ITEM_CLASS_NAME}>
              <AttachmentCard
                attachment={artifact}
                artifactId={item.artifactId}
                variant="composer"
                displayMode="file"
                thumbnailMode="inline"
                density="compact"
                subtitle={formatBytes(artifact.sizeBytes)}
              />
            </li>
          );
        })}
      </ul>
      <Flex className={ARTIFACT_ACTIONS_CLASS_NAME} align="stretch">
        <UiButton
          className={ARTIFACT_ACTION_BUTTON_CLASS_NAME}
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

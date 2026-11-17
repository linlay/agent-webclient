import React, { useRef, useState } from "react";
import { ArchiveDetailPane } from "@/features/archive/components/ArchiveDetailPane";
import { ArchiveListPane } from "@/features/archive/components/ArchiveListPane";
import {
  useArchiveRuntime,
  type RestoredArchiveChatSummary,
} from "@/features/archive/hooks/useArchiveRuntime";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import { t } from "@/shared/i18n";
import "./ArchiveConsole.module.css";
export type { RestoredArchiveChatSummary } from "@/features/archive/hooks/useArchiveRuntime";
export { buildArchiveBulkCandidates } from "@/features/archive/lib/archiveViewModel";

const ARCHIVE_LIST_DEFAULT_WIDTH = 280;
const ARCHIVE_LIST_MIN_WIDTH = 280;
const ARCHIVE_LIST_SSR_VIEWPORT_WIDTH = 1440;

/**
 * The split never switches to an expanded list, so the list may only grow up
 * to half the viewport and the detail pane keeps a readable column next to it.
 */
function getArchiveListMaxWidth(): number {
  const viewportWidth =
    typeof window === "undefined"
      ? ARCHIVE_LIST_SSR_VIEWPORT_WIDTH
      : window.innerWidth;
  return Math.max(ARCHIVE_LIST_MIN_WIDTH, Math.floor(viewportWidth / 2));
}

const ARCHIVE_CONSOLE_CLASS =
  "archive-console tw:grid tw:h-full tw:min-h-0 tw:max-h-none tw:grid-cols-[var(--archive-list-col,280px)_minmax(0,1fr)]";
const ARCHIVE_LIST_PANE_CLASS_NAME =
  "archive-console-list-pane tw:relative tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:overflow-hidden";
const ARCHIVE_RESIZE_HANDLE_CLASS_NAME = "archive-console-resize-handle";

export interface ArchiveConsoleProps {
  active?: boolean;
  selectedChatId?: string;
  onSelectedChatIdChange?: (chatId: string) => void;
  onOpenRestoredChat?: (summary: RestoredArchiveChatSummary) => void;
  showAgentFilter?: boolean;
}

export const ArchiveConsole: React.FC<ArchiveConsoleProps> = ({
  active = true,
  selectedChatId,
  onSelectedChatIdChange,
  onOpenRestoredChat,
  showAgentFilter = false,
}) => {
  const runtime = useArchiveRuntime({
    active,
    selectedChatId,
    onSelectedChatIdChange,
    onOpenRestoredChat,
    showAgentFilter,
  });

  const [listWidth, setListWidth] = useState(ARCHIVE_LIST_DEFAULT_WIDTH);
  const listStartWidthRef = useRef(ARCHIVE_LIST_DEFAULT_WIDTH);
  const { handlePointerDown: handleListResize } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => {
      listStartWidthRef.current = listWidth;
    },
    onResize: (delta) => {
      setListWidth(
        Math.max(
          ARCHIVE_LIST_MIN_WIDTH,
          Math.min(getArchiveListMaxWidth(), listStartWidthRef.current + delta),
        ),
      );
    },
  });

  const listPane = (
    <ArchiveListPane
      query={runtime.query}
      onQueryChange={runtime.setQuery}
      agents={runtime.agents}
      showAgentFilter={showAgentFilter}
      agentFilter={runtime.agentFilter}
      onAgentFilterChange={runtime.setAgentFilter}
      archivedRange={runtime.archivedRange}
      onArchivedRangeChange={runtime.setArchivedRange}
      createdRange={runtime.createdRange}
      onCreatedRangeChange={runtime.setCreatedRange}
      lastRunRange={runtime.lastRunRange}
      onLastRunRangeChange={runtime.setLastRunRange}
      filteredCount={runtime.items.length}
      totalCount={runtime.totalCount}
      onResetFilters={runtime.resetFilters}
      onRefresh={runtime.refresh}
      resultText={runtime.resultText}
      loading={runtime.loadingList}
      items={runtime.items}
      selectedChatId={runtime.selected}
      onSelect={(chatId) => void runtime.loadArchiveDetail(chatId)}
      canRestoreAndOpen={Boolean(onOpenRestoredChat)}
      onRestore={(chatId, openAfterRestore) =>
        runtime.restoreSelected(chatId, openAfterRestore)
      }
      onDelete={(chatId) => runtime.deleteSelected(chatId)}
      onRestoreGroup={(agentKey) => runtime.restoreGroup(agentKey)}
      onDeleteGroup={(agentKey) => runtime.deleteGroup(agentKey)}
    />
  );

  return (
    <div
      className={ARCHIVE_CONSOLE_CLASS}
      style={{ "--archive-list-col": `${listWidth}px` } as React.CSSProperties}
    >
      <div className={ARCHIVE_LIST_PANE_CLASS_NAME}>
        {listPane}
        <button
          type="button"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("archive.resize.listAriaLabel")}
          title={t("archive.resize.listTitle")}
          className={ARCHIVE_RESIZE_HANDLE_CLASS_NAME}
          onPointerDown={handleListResize}
        />
      </div>
      {runtime.selected ? (
        <ArchiveDetailPane
          selectedChatId={runtime.selected}
          selectedItem={runtime.selectedItem}
          detail={runtime.detail}
          loading={runtime.loadingDetail}
          conversation={runtime.conversation}
          usageSummary={runtime.usageSummary}
          agents={runtime.agents}
        />
      ) : (
        <section className="archive-detail-empty">
          <p className="archive-detail-empty-hint">{t("archive.empty.select")}</p>
        </section>
      )}
    </div>
  );
};

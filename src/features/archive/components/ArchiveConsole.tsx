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
export {
  buildArchiveBulkCandidates,
  extractArchivePreviewLines,
} from "@/features/archive/lib/archiveViewModel";

const ARCHIVE_CONSOLE_CLASS =
  "archive-console archive-console-page tw:grid tw:h-full tw:min-h-0 tw:max-h-none tw:grid-cols-[var(--archive-list-col,280px)_minmax(0,1fr)] tw:[&_.archive-detail-content]:max-h-none tw:[&_.archive-list]:max-h-none";
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

  const [listWidth, setListWidth] = useState(280);
  const listStartWidthRef = useRef(280);
  const { handlePointerDown: handleListResize } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => {
      listStartWidthRef.current = listWidth;
    },
    onResize: (delta) =>
      setListWidth(
        Math.max(220, Math.min(520, listStartWidthRef.current + delta)),
      ),
  });

  return (
    <div
      className={ARCHIVE_CONSOLE_CLASS}
      style={{ "--archive-list-col": `${listWidth}px` } as React.CSSProperties}
    >
      <div className={ARCHIVE_LIST_PANE_CLASS_NAME}>
        <ArchiveListPane
          query={runtime.query}
          onQueryChange={runtime.setQuery}
          agents={runtime.agents}
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
        />
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
      <ArchiveDetailPane
        selectedChatId={runtime.selected}
        selectedItem={runtime.selectedItem}
        detail={runtime.detail}
        loading={runtime.loadingDetail}
        previewLines={runtime.previewLines}
        usageSummary={runtime.usageSummary}
      />
    </div>
  );
};

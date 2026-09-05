import React from "react";
import { ArchiveDetailPane } from "@/features/archive/components/ArchiveDetailPane";
import { ArchiveListPane } from "@/features/archive/components/ArchiveListPane";
import {
  useArchiveRuntime,
  type RestoredArchiveChatSummary,
} from "@/features/archive/hooks/useArchiveRuntime";
import "./ArchiveOverlay.module.css";

export type { RestoredArchiveChatSummary } from "@/features/archive/hooks/useArchiveRuntime";
export {
  buildArchiveBulkCandidates,
  extractArchivePreviewLines,
} from "@/features/archive/lib/archiveViewModel";

const ARCHIVE_CONSOLE_CLASS_BY_SURFACE = {
  modal:
    "archive-console archive-console-modal tw:grid tw:min-h-[520px] tw:max-h-[min(72vh,720px)] tw:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] tw:gap-4",
  page:
    "archive-console archive-console-page tw:grid tw:h-full tw:min-h-0 tw:max-h-none tw:grid-cols-[280px_minmax(0,1fr)] tw:gap-4 tw:[&_.archive-detail-content]:max-h-none tw:[&_.archive-list]:max-h-none",
} as const;

export interface ArchiveConsoleProps {
  active?: boolean;
  surface?: "modal" | "page";
  selectedChatId?: string;
  onSelectedChatIdChange?: (chatId: string) => void;
  onOpenRestoredChat?: (summary: RestoredArchiveChatSummary) => void;
  showAgentFilter?: boolean;
}

export const ArchiveConsole: React.FC<ArchiveConsoleProps> = ({
  active = true,
  surface = "modal",
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

  return (
    <div className={ARCHIVE_CONSOLE_CLASS_BY_SURFACE[surface]}>
      <ArchiveListPane
        query={runtime.query}
        onQueryChange={runtime.setQuery}
        showAgentFilter={showAgentFilter}
        agentFilter={runtime.agentFilter}
        onAgentFilterChange={runtime.setAgentFilter}
        bulkDays={runtime.bulkDays}
        onBulkDaysChange={runtime.setBulkDays}
        bulkCandidateCount={runtime.bulkCandidateCount}
        onBulkArchive={runtime.bulkArchive}
        resultText={runtime.resultText}
        loading={runtime.loadingList}
        items={runtime.items}
        selectedChatId={runtime.selected}
        onSelect={(chatId) => void runtime.loadArchiveDetail(chatId)}
        canLoadMore={runtime.canLoadMore}
        onLoadMore={() => void runtime.loadArchives(runtime.offset, true)}
      />
      <ArchiveDetailPane
        selectedChatId={runtime.selected}
        selectedItem={runtime.selectedItem}
        detail={runtime.detail}
        loading={runtime.loadingDetail}
        previewLines={runtime.previewLines}
        usageSummary={runtime.usageSummary}
        canRestoreAndOpen={Boolean(onOpenRestoredChat)}
        onRestore={(openAfterRestore) =>
          runtime.restoreSelected(runtime.selected, openAfterRestore)
        }
        onDelete={() => runtime.deleteSelected(runtime.selected)}
      />
    </div>
  );
};

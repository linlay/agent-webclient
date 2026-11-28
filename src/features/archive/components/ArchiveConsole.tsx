import React, { useEffect, useRef, useState } from "react";
import { ArchiveDetailPane } from "@/features/archive/components/ArchiveDetailPane";
import { ArchiveListPane } from "@/features/archive/components/ArchiveListPane";
import {
  useArchiveRuntime,
  type RestoredArchiveChatSummary,
} from "@/features/archive/hooks/useArchiveRuntime";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { MobileSwipeDrawer, type MobileSwipeDrawerHandle } from "@/shared/ui/MobileSwipeDrawer";
import { useMobileSwipeGestures } from "@/shared/ui/hooks/useMobileSwipeGestures";
import { useMobilePageHeaderAction } from "@/shared/ui/MobilePageHeaderAction";
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
  /** 移动端：列表收进左侧抽屉，详情独占整屏。 */
  mobile?: boolean;
}

export const ArchiveConsole: React.FC<ArchiveConsoleProps> = ({
  active = true,
  selectedChatId,
  onSelectedChatIdChange,
  onOpenRestoredChat,
  showAgentFilter = false,
  mobile = false,
}) => {
  const runtime = useArchiveRuntime({
    active,
    selectedChatId,
    onSelectedChatIdChange,
    onOpenRestoredChat,
    showAgentFilter,
  });

  const [listWidth, setListWidth] = useState(ARCHIVE_LIST_DEFAULT_WIDTH);
  const consoleRootRef = useRef<HTMLDivElement>(null);
  const detailRegionRef = useRef<HTMLDivElement>(null);
  const listDrawerRef = useRef<MobileSwipeDrawerHandle>(null);
  const emptyPanelRef = useRef<MobileSwipeDrawerHandle>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const mobileListLayout = Boolean(mobile);
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

  const selectedName =
    runtime.selectedItem?.chatName ||
    runtime.selected ||
    t("archive.mobile.noSelection");
  useEffect(() => {
    if (!mobileListLayout) setMobileListOpen(false);
  }, [mobileListLayout]);
  useEffect(() => {
    const element = detailRegionRef.current;
    if (!element) return;
    element.inert = mobileListOpen;
    return () => { element.inert = false; };
  }, [mobileListOpen]);
  const openMobileList = () => setMobileListOpen(true);
  const closeMobileList = () => setMobileListOpen(false);
  const toggleMobileList = () => setMobileListOpen((open) => !open);
  useMobileSwipeGestures({
    rootRef: consoleRootRef,
    left: {
      ref: listDrawerRef,
      open: mobileListOpen,
      onOpen: openMobileList,
      onClose: closeMobileList,
    },
    right: {
      ref: emptyPanelRef,
      open: false,
      onOpen: () => {},
      onClose: () => {},
    },
    disabled: !mobileListLayout,
  });
  useMobilePageHeaderAction(
    mobileListLayout
      ? {
          label: selectedName,
          ariaLabel: t("archive.mobile.switcherAriaLabel", {
            name: selectedName,
          }),
          avatar: (
            <MaterialIcon
              name="archive"
              style={{ width: 20, height: 20, fontSize: 20 }}
            />
          ),
          icon: "swap_horiz",
          expanded: mobileListOpen,
          onActivate: toggleMobileList,
        }
      : null,
  );

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
      onSelect={(chatId) => {
        if (mobileListLayout) setMobileListOpen(false);
        void runtime.loadArchiveDetail(chatId);
      }}
      canRestoreAndOpen={Boolean(onOpenRestoredChat)}
      onRestore={(chatId, openAfterRestore) =>
        runtime.restoreSelected(chatId, openAfterRestore)
      }
      onDelete={(chatId) => runtime.deleteSelected(chatId)}
      onRestoreGroup={(agentKey) => runtime.restoreGroup(agentKey)}
      onDeleteGroup={(agentKey) => runtime.deleteGroup(agentKey)}
      mobile={mobileListLayout}
    />
  );
  const listPaneShell = (
    <div className={ARCHIVE_LIST_PANE_CLASS_NAME}>
      {listPane}
      {mobileListLayout ? null : (
        <button
          type="button"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("archive.resize.listAriaLabel")}
          title={t("archive.resize.listTitle")}
          className={ARCHIVE_RESIZE_HANDLE_CLASS_NAME}
          onPointerDown={handleListResize}
        />
      )}
    </div>
  );

  return (
    <div
      ref={consoleRootRef}
      className={`${ARCHIVE_CONSOLE_CLASS} ${mobileListLayout ? "is-mobile" : ""}`}
      style={{ "--archive-list-col": `${listWidth}px` } as React.CSSProperties}
    >
      {mobileListLayout ? null : listPaneShell}
      <div ref={detailRegionRef} className="archive-detail-region">
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
      {mobileListLayout ? (
        <MobileSwipeDrawer
          ref={listDrawerRef}
          side="left"
          open={mobileListOpen}
          onClose={closeMobileList}
          ariaLabel={t("archive.list.ariaLabel")}
          className="archive-mobile-list-drawer"
          fullWidth
        >
          {listPaneShell}
        </MobileSwipeDrawer>
      ) : null}
    </div>
  );
};

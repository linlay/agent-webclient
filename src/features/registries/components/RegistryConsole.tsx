import { useResourceAssistant } from "@/features/resource-assistant/hooks/useResourceAssistant";
import React, { useEffect, useRef, useState } from "react";
import { useOptionalAppContext } from "@/app/state/AppContext";
import { RegistryDetailPane } from "@/features/registries/components/RegistryDetailPane";
import {
  RegistryCategoryTabs,
  RegistryListPane,
} from "@/features/registries/components/RegistryListPane";
import { useRegistryConsoleRuntime } from "@/features/registries/hooks/useRegistryConsoleRuntime";
import {
  registryItemIcon,
  registryItemKey,
  registryListTitle,
  translateWithFallback,
  type RegistryEditableCategory,
} from "@/features/registries/lib/registryConsole";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import { BottomSheet } from "@/shared/ui/BottomSheet";
import { MobileSwipeDrawer, type MobileSwipeDrawerHandle } from "@/shared/ui/MobileSwipeDrawer";
import { useMobileSwipeGestures } from "@/shared/ui/hooks/useMobileSwipeGestures";
import { useMobilePageHeaderAction } from "@/shared/ui/MobilePageHeaderAction";
import styles from "./RegistryConsole.module.css";

const CONSOLE_CLASS_NAME =
  "management-page-console automation-console registry-console tw:overflow-hidden";
const ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const MESSAGE_CLASS_NAME =
  "registry-console-message tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--accent-electric)_28%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-electric)_7%,transparent)]";
const BODY_CLASS_NAME =
  "automation-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[var(--registry-list-col,280px)_minmax(0,1fr)] tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const LIST_PANE_CLASS_NAME =
  "registry-console-list-pane tw:relative tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:overflow-hidden tw:max-[860px]:max-h-[260px] tw:border-r-1 tw:border-[var(--line-soft)]";
const RESIZE_HANDLE_CLASS_NAME = "registry-console-resize-handle";

export interface RegistryConsoleProps {
  /** 移动端：列表收进左侧抽屉，详情独占整屏。 */
  mobile?: boolean;
}

export function RegistryConsole({ mobile = false }: RegistryConsoleProps) {
  const { t } = useI18n();
  const appContext = useOptionalAppContext();
  const runtime = useRegistryConsoleRuntime();
  const assistant = useResourceAssistant();
  const [listWidth, setListWidth] = useState(280);
  const consoleRootRef = useRef<HTMLDivElement>(null);
  const detailRegionRef = useRef<HTMLDivElement>(null);
  const listDrawerRef = useRef<MobileSwipeDrawerHandle>(null);
  const emptyPanelRef = useRef<MobileSwipeDrawerHandle>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [categoryActionsOpen, setCategoryActionsOpen] = useState(false);
  const mobileListLayout = Boolean(mobile);
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
  const canLeaveDraft = () =>
    !runtime.dirty || window.confirm(t("registryConsole.confirm.discard"));
  const refresh = () => {
    if (runtime.isToolsTab || runtime.detail) {
      if (!canLeaveDraft()) return;
      runtime.refreshCurrent();
      return;
    }
    void runtime.loadRegistries(
      runtime.selectedKey,
      runtime.activeCategory as RegistryEditableCategory,
    );
  };

  const handleEditConversation = () => {
    const detail = runtime.detail;
    if (detail && !runtime.saving && !assistant.opening) {
      void assistant.open({
        kind: "registry",
        category: detail.category,
        target: { id: detail.file, name: detail.name || detail.key },
      });
    }
  };

  const categoryLabel = translateWithFallback(
    t,
    `registryConsole.category.${runtime.activeCategory}`,
    runtime.activeCategory,
  );
  const selectedItem =
    runtime.currentCategoryItems.find(
      (item) => registryItemKey(item) === runtime.selectedKey,
    ) ||
    runtime.filteredItems.find(
      (item) => registryItemKey(item) === runtime.selectedKey,
    );
  const detailName = runtime.detail
    ? runtime.detail.name || runtime.detail.key || runtime.detail.file
    : "";
  const currentName =
    (runtime.isToolsTab ? runtime.selectedTool?.name || "" : detailName) ||
    (selectedItem ? registryListTitle(selectedItem) : "") ||
    categoryLabel;
  const selectedIcon = selectedItem ? registryItemIcon(selectedItem) : null;
  const headerIcon = runtime.isToolsTab
    ? "build"
    : runtime.activeCategory === "providers"
      ? "hub"
      : "smart_toy";

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
          label: currentName,
          ariaLabel: t("registryConsole.mobile.switcherAriaLabel", {
            name: currentName,
          }),
          avatar: selectedIcon ? (
            <img
              className={styles.registryIcon}
              src={selectedIcon.icon}
              width={20}
              height={20}
              alt=""
              aria-hidden="true"
              data-monochrome={selectedIcon.isMonochrome}
            />
          ) : (
            <MaterialIcon
              name={headerIcon}
              style={{ width: 20, height: 20, fontSize: 20 }}
            />
          ),
          icon: "swap_horiz",
          expanded: mobileListOpen,
          onActivate: toggleMobileList,
        }
      : null,
  );

  const categoryActions = mobileListLayout ? (
    <>
      <UiButton
        size="sm"
        variant="ghost"
        iconOnly
        aria-label={t("registryConsole.mobile.tabsMore")}
        onClick={() => setCategoryActionsOpen(true)}
      >
        <MaterialIcon name="more_horiz" />
      </UiButton>
      {!runtime.isToolsTab && runtime.detail ? (
        <UiButton
          size="sm"
          variant="primary"
          iconOnly
          aria-label={t("registryConsole.action.save")}
          loading={runtime.saving}
          disabled={runtime.saving || !runtime.dirty}
          onClick={() => void runtime.saveDraft()}
        >
          <MaterialIcon name="save" />
        </UiButton>
      ) : null}
    </>
  ) : (
    <>
      {runtime.isToolsTab ? (
        <UiButton
          size="sm"
          variant="ghost"
          iconOnly
          onClick={refresh}
          disabled={runtime.loading || runtime.toolsLoading}
          title={t("registryConsole.action.refresh")}
          aria-label={t("registryConsole.action.refresh")}
        >
          <MaterialIcon name="refresh" />
        </UiButton>
      ) : runtime.detail ? (
        <>
          {runtime.dirty ? (
            <span className="registry-dirty tw:text-xs tw:text-ink-muted">
              {t("registryConsole.message.unsaved")}
            </span>
          ) : null}
          {!runtime.newDraft && (
            <UiButton
              size="sm"
              variant="ghost"
              iconOnly
              onClick={handleEditConversation}
              disabled={
                runtime.saving ||
                runtime.detailLoading ||
                assistant.opening
              }
              title={t("resourceAssistant.conversationEdit")}
              aria-label={t("resourceAssistant.conversationEdit")}
            >
              <MaterialIcon name="question_answer" />
            </UiButton>
          )}
          <UiButton
            size="sm"
            variant="ghost"
            iconOnly
            onClick={() => void runtime.validateDraft()}
            disabled={runtime.validating || runtime.saving}
            title={t("registryConsole.action.validate")}
            aria-label={t("registryConsole.action.validate")}
          >
            <MaterialIcon name="rule" />
          </UiButton>
          <UiButton
            size="sm"
            variant="ghost"
            iconOnly
            onClick={refresh}
            disabled={runtime.newDraft || runtime.detailLoading}
            title={t("registryConsole.action.refreshFile")}
            aria-label={t("registryConsole.action.refreshFile")}
          >
            <MaterialIcon name="refresh" />
          </UiButton>
          <UiButton
            size="sm"
            variant="primary"
            className="tw:ml-2"
            onClick={() => void runtime.saveDraft()}
            disabled={runtime.saving || !runtime.dirty}
          >
            <MaterialIcon name="save" />
            <span>{t("registryConsole.action.save")}</span>
          </UiButton>
        </>
      ) : (
        <UiButton
          size="sm"
          variant="ghost"
          iconOnly
          onClick={refresh}
          disabled={runtime.loading}
          title={t("registryConsole.action.refreshFile")}
          aria-label={t("registryConsole.action.refreshFile")}
        >
          <MaterialIcon name="refresh" />
        </UiButton>
      )}
    </>
  );

  const listPane = (
    <div className={LIST_PANE_CLASS_NAME}>
      <RegistryListPane
        currentCategoryItems={runtime.currentCategoryItems}
        filteredItems={runtime.filteredItems}
        isToolsTab={runtime.isToolsTab}
        loading={runtime.loading}
        refreshDisabled={
          runtime.loading || runtime.saving || runtime.toolsLoading
        }
        searchText={runtime.searchText}
        selectedKey={runtime.selectedKey}
        statusDropdownOpen={runtime.statusDropdownOpen}
        statusFilter={runtime.statusFilter}
        toolsLoading={runtime.toolsLoading}
        onCreate={() => {
          if (mobileListLayout) setMobileListOpen(false);
          runtime.startNew();
        }}
        onCreateConversation={() => {
          if (!runtime.saving && !assistant.opening && canLeaveDraft()) {
            if (mobileListLayout) setMobileListOpen(false);
            void assistant.open({
              kind: "registry",
              category: runtime.activeCategory,
            });
          }
        }}
        onRefresh={refresh}
        onSearchChange={runtime.setSearchText}
        onSelect={(item) => {
          if (mobileListLayout) setMobileListOpen(false);
          runtime.selectItem(item);
        }}
        onStatusDropdownOpenChange={runtime.setStatusDropdownOpen}
        onStatusFilterChange={runtime.setStatusFilter}
      />
      {mobileListLayout ? null : (
        <button
          type="button"
          role="separator"
          aria-orientation="vertical"
          className={RESIZE_HANDLE_CLASS_NAME}
          onPointerDown={handleListResize}
        />
      )}
    </div>
  );

  return (
    <div
      ref={consoleRootRef}
      className={`${CONSOLE_CLASS_NAME} ${mobileListLayout ? "is-mobile" : ""}`}
    >
      <RegistryCategoryTabs
        activeCategory={runtime.activeCategory}
        categoryCounts={runtime.categoryCounts}
        onSwitchCategory={runtime.switchCategory}
        extra={categoryActions}
      />
      {runtime.error ? (
        <div className={ERROR_CLASS_NAME}>
          <span>{runtime.error}</span>
          <UiButton size="sm" variant="ghost" onClick={refresh}>
            {t("registryConsole.action.retry")}
          </UiButton>
        </div>
      ) : null}
      {runtime.message && !runtime.error ? (
        <div className={MESSAGE_CLASS_NAME}>{runtime.message}</div>
      ) : null}
      <div
        className={BODY_CLASS_NAME}
        style={
          { "--registry-list-col": `${listWidth}px` } as React.CSSProperties
        }
      >
        {mobileListLayout ? null : listPane}
        <div ref={detailRegionRef} className="registry-console-detail-region">
          <RegistryDetailPane
            detail={runtime.detail}
            detailLoading={runtime.detailLoading}
            dirty={runtime.dirty}
            draft={runtime.draft}
            isToolsTab={runtime.isToolsTab}
            newDraft={runtime.newDraft}
            saving={runtime.saving}
            selectedTool={runtime.selectedTool}
            theme={appContext?.state.themeMode ?? "light"}
            validating={runtime.validating}
            onEditConversation={handleEditConversation}
            onDraftChange={runtime.updateDraft}
            onRefresh={runtime.refreshCurrent}
            onSave={() => void runtime.saveDraft()}
            onValidate={() => void runtime.validateDraft()}
          />
        </div>
      </div>
      {mobileListLayout ? (
        <MobileSwipeDrawer
          ref={listDrawerRef}
          side="left"
          open={mobileListOpen}
          onClose={closeMobileList}
          ariaLabel={t("registryConsole.mobile.listTitle")}
          className="registry-mobile-list-drawer"
          fullWidth
        >
          {listPane}
        </MobileSwipeDrawer>
      ) : null}
      {mobileListLayout ? (
        <BottomSheet
          open={categoryActionsOpen}
          onClose={() => setCategoryActionsOpen(false)}
          ariaLabel={t("registryConsole.mobile.tabsMore")}
          getContainer=".layout-mobile"
        >
          <div className="registry-actions-list">
            <div className="registry-actions-sheet-title">
              {t("registryConsole.mobile.tabsMore")}
            </div>
            {!runtime.isToolsTab && runtime.detail && !runtime.newDraft ? (
              <button
                type="button"
                className="registry-actions-row"
                disabled={runtime.saving || runtime.detailLoading || assistant.opening}
                onClick={() => {
                  setCategoryActionsOpen(false);
                  handleEditConversation();
                }}
              >
                <MaterialIcon name="question_answer" />
                <span>{t("resourceAssistant.conversationEdit")}</span>
              </button>
            ) : null}
            {!runtime.isToolsTab && runtime.detail ? (
              <button
                type="button"
                className="registry-actions-row"
                disabled={runtime.validating || runtime.saving}
                onClick={() => {
                  setCategoryActionsOpen(false);
                  void runtime.validateDraft();
                }}
              >
                <MaterialIcon name="rule" />
                <span>{t("registryConsole.action.validate")}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="registry-actions-row"
              disabled={
                runtime.isToolsTab
                  ? runtime.loading || runtime.toolsLoading
                  : runtime.detail
                    ? runtime.newDraft || runtime.detailLoading
                    : runtime.loading
              }
              onClick={() => {
                setCategoryActionsOpen(false);
                refresh();
              }}
            >
              <MaterialIcon name="refresh" />
              <span>
                {t(
                  runtime.isToolsTab
                    ? "registryConsole.action.refresh"
                    : "registryConsole.action.refreshFile",
                )}
              </span>
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}

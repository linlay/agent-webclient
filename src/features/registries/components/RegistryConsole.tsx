import { useResourceAssistant } from "@/features/resource-assistant/hooks/useResourceAssistant";
import React, { useRef, useState } from "react";
import { useOptionalAppContext } from "@/app/state/AppContext";
import { RegistryDetailPane } from "@/features/registries/components/RegistryDetailPane";
import {
  RegistryCategoryTabs,
  RegistryListPane,
} from "@/features/registries/components/RegistryListPane";
import { useRegistryConsoleRuntime } from "@/features/registries/hooks/useRegistryConsoleRuntime";
import type { RegistryEditableCategory } from "@/features/registries/lib/registryConsole";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import "./RegistryConsole.module.css";

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

export function RegistryConsole() {
  const { t } = useI18n();
  const appContext = useOptionalAppContext();
  const runtime = useRegistryConsoleRuntime();
  const assistant = useResourceAssistant();
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

  const categoryActions = (
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

  return (
    <div className={CONSOLE_CLASS_NAME}>
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
            onCreate={runtime.startNew}
            onCreateConversation={() => {
              if (!runtime.saving && !assistant.opening && canLeaveDraft())
                void assistant.open({
                  kind: "registry",
                  category: runtime.activeCategory,
                });
            }}
            onRefresh={refresh}
            onSearchChange={runtime.setSearchText}
            onSelect={runtime.selectItem}
            onStatusDropdownOpenChange={runtime.setStatusDropdownOpen}
            onStatusFilterChange={runtime.setStatusFilter}
          />
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            className={RESIZE_HANDLE_CLASS_NAME}
            onPointerDown={handleListResize}
          />
        </div>
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
  );
}

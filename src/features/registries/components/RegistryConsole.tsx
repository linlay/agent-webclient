import { useOptionalAppContext } from "@/app/state/AppContext";
import { RegistryDetailPane } from "@/features/registries/components/RegistryDetailPane";
import {
  RegistryCategoryTabs,
  RegistryListPane,
} from "@/features/registries/components/RegistryListPane";
import { useRegistryConsoleRuntime } from "@/features/registries/hooks/useRegistryConsoleRuntime";
import type { RegistryEditableCategory } from "@/features/registries/lib/registryConsole";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import "./RegistryConsole.module.css";

const CONSOLE_CLASS_NAME =
  "management-page-console automation-console registry-console tw:overflow-hidden";
const ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const MESSAGE_CLASS_NAME =
  "registry-console-message tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--accent-electric)_28%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-electric)_7%,transparent)]";
const BODY_CLASS_NAME =
  "automation-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[280px_minmax(0,1fr)] tw:gap-4 tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";

export function RegistryConsole() {
  const { t } = useI18n();
  const appContext = useOptionalAppContext();
  const runtime = useRegistryConsoleRuntime();
  const refresh = () => {
    if (runtime.isToolsTab || runtime.detail) {
      runtime.refreshCurrent();
      return;
    }
    void runtime.loadRegistries(
      runtime.selectedKey,
      runtime.activeCategory as RegistryEditableCategory,
    );
  };

  return (
    <div className={CONSOLE_CLASS_NAME}>
      <RegistryCategoryTabs
        activeCategory={runtime.activeCategory}
        categoryCounts={runtime.categoryCounts}
        onSwitchCategory={runtime.switchCategory}
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
      <div className={BODY_CLASS_NAME}>
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
          onRefresh={refresh}
          onSearchChange={runtime.setSearchText}
          onSelect={runtime.selectItem}
          onStatusDropdownOpenChange={runtime.setStatusDropdownOpen}
          onStatusFilterChange={runtime.setStatusFilter}
        />
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
          onDraftChange={runtime.updateDraft}
          onRefresh={runtime.refreshCurrent}
          onSave={() => void runtime.saveDraft()}
          onValidate={() => void runtime.validateDraft()}
        />
      </div>
    </div>
  );
}

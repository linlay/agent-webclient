import { useMemo } from "react";
import { Spin } from "antd";
import type { MenuProps } from "antd";
import {
  REGISTRY_CONSOLE_TABS,
  REGISTRY_STATUS_FILTERS,
  listItemOwnerLabel,
  registryCapabilityChips,
  registryItemKey,
  registryListMeta,
  registryListTitle,
  registryStatusTone,
  toolListMeta,
  translateWithFallback,
  type RegistryCapabilityChip,
  type RegistryStatusFilter,
} from "@/features/registries/lib/registryConsole";
import type {
  AdminRegistryListItem,
  RegistryConsoleTab,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import styles from "./RegistryConsole.module.css";

const LIST_CLASS_NAME =
  "automation-console-list tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[260px]";
const TOOLBAR_CLASS_NAME =
  "automation-console-toolbar registry-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2 tw:max-[860px]:grid-cols-[minmax(0,1fr)_auto_auto]";
const LIST_ITEM_CLASS_NAME =
  "automation-list-item tw:flex tw:w-full tw:flex-col tw:gap-[3px] tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const CAPABILITY_CHIP_CLASS_NAME =
  "registry-capability-chip tw:inline-flex tw:h-5 tw:w-[22px] tw:min-w-[22px] tw:flex-none tw:items-center tw:justify-center tw:rounded-[var(--radius-sm)] tw:p-0 tw:[&_.material-icon-svg]:h-3 tw:[&_.material-icon-svg]:w-3";

export function RegistryCapabilityIconTag({
  chip,
  label,
}: {
  chip: RegistryCapabilityChip;
  label: string;
}) {
  return (
    <UiTag
      tone="muted"
      className={CAPABILITY_CHIP_CLASS_NAME}
      title={label}
      role="img"
      aria-label={label}
    >
      <MaterialIcon name={chip.icon} />
    </UiTag>
  );
}

export interface RegistryListPaneProps {
  currentCategoryItems: AdminRegistryListItem[];
  filteredItems: AdminRegistryListItem[];
  isToolsTab: boolean;
  loading: boolean;
  refreshDisabled: boolean;
  searchText: string;
  selectedKey: string;
  statusDropdownOpen: boolean;
  statusFilter: RegistryStatusFilter;
  toolsLoading: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (item: AdminRegistryListItem) => void;
  onStatusDropdownOpenChange: (open: boolean) => void;
  onStatusFilterChange: (status: RegistryStatusFilter) => void;
}

export function RegistryCategoryTabs({
  activeCategory,
  categoryCounts,
  onSwitchCategory,
}: {
  activeCategory: RegistryConsoleTab;
  categoryCounts: Record<RegistryConsoleTab, number>;
  onSwitchCategory: (category: RegistryConsoleTab) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={styles.categoryTabs}
      role="tablist"
      aria-label={t("registryConsole.section.categories")}
    >
      {REGISTRY_CONSOLE_TABS.map((category) => (
        <button
          type="button"
          key={category}
          role="tab"
          aria-selected={category === activeCategory}
          className={styles.categoryTab}
          onClick={() => onSwitchCategory(category)}
        >
          <span>
            {translateWithFallback(
              t,
              `registryConsole.category.${category}`,
              category,
            )}
          </span>
          <strong>{categoryCounts[category]}</strong>
        </button>
      ))}
    </div>
  );
}

export function RegistryListPane(props: RegistryListPaneProps) {
  const { t } = useI18n();
  const statusMenu: MenuProps = useMemo(
    () => ({
      onClick: (info) =>
        props.onStatusFilterChange(info.key as RegistryStatusFilter),
      selectedKeys: [props.statusFilter],
      items: REGISTRY_STATUS_FILTERS.map((status) => ({
        key: status,
        label: translateWithFallback(
          t,
          `registryConsole.filter.status.${status}`,
          status,
        ),
      })),
    }),
    [props, t],
  );

  return (
      <div className={LIST_CLASS_NAME}>
        <div className={TOOLBAR_CLASS_NAME}>
          <SearchFilterBar
            searchText={props.searchText}
            onSearchChange={props.onSearchChange}
            searchPlaceholder={
              props.isToolsTab
                ? t("registryConsole.searchToolsPlaceholder")
                : t("registryConsole.searchPlaceholder")
            }
            filters={
              props.isToolsTab
                ? []
                : [
                    {
                      key: "status",
                      label: t("registryConsole.filter.status.all"),
                      icon: "filter_list",
                      active: props.statusFilter !== "all",
                      open: props.statusDropdownOpen,
                      onOpenChange: props.onStatusDropdownOpenChange,
                      menu: statusMenu,
                    },
                  ]
            }
          />
          <UiButton
            size="sm"
            variant="ghost"
            iconOnly
            onClick={props.onRefresh}
            disabled={props.refreshDisabled}
            aria-label={t("registryConsole.action.refresh")}
          >
            <MaterialIcon name="refresh" />
          </UiButton>
          {!props.isToolsTab ? (
            <UiButton
              size="sm"
              variant="primary"
              iconOnly
              onClick={props.onCreate}
              aria-label={t("registryConsole.action.new")}
            >
              <MaterialIcon name="add" />
            </UiButton>
          ) : null}
        </div>
        <div className="automation-console-count tw:text-xs tw:text-ink-muted">
          {props.isToolsTab
            ? t("registryConsole.list.count.tools", {
                count: props.currentCategoryItems.length,
              })
            : t("registryConsole.list.count", {
                count: props.currentCategoryItems.length,
              })}
        </div>
        <div className="automation-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto tw:pr-0.5">
          <Spin spinning={props.isToolsTab ? props.toolsLoading : props.loading}>
            {props.filteredItems.length === 0 ? (
              <div className="command-empty-state">
                {props.isToolsTab
                  ? t("registryConsole.tools.empty")
                  : t("registryConsole.empty")}
                {!props.isToolsTab ? (
                  <UiButton size="sm" variant="primary" onClick={props.onCreate}>
                    {t("registryConsole.action.create")}
                  </UiButton>
                ) : null}
              </div>
            ) : (
              <div className="automation-list-items tw:flex tw:flex-col tw:gap-1.5">
                {props.filteredItems.map((item) => {
                  const itemKey =
                    String(item.category) === "tools"
                      ? `tools/${item.file}`
                      : registryItemKey(item);
                  const meta = props.isToolsTab
                    ? toolListMeta(item)
                    : registryListMeta(item, t);
                  const ownerLabel = listItemOwnerLabel(item, props.isToolsTab, t);
                  const chips = props.isToolsTab ? [] : registryCapabilityChips(item);
                  const capabilityTitle = chips
                    .map((chip) => t(chip.labelKey))
                    .join(", ");
                  return (
                    <button
                      type="button"
                      key={itemKey}
                      className={`${LIST_ITEM_CLASS_NAME} ${itemKey === props.selectedKey ? "is-active" : ""}`}
                      onClick={() => props.onSelect(item)}
                    >
                      <span className="automation-list-item-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2 tw:[&_.ui-tag]:flex-none">
                        <span
                          className="automation-list-item-title tw:inline-flex tw:min-w-0 tw:flex-1 tw:items-baseline tw:gap-[5px] tw:overflow-hidden tw:whitespace-nowrap"
                          title={`${item.category} ${item.file}`}
                        >
                          {ownerLabel ? (
                            <span className="automation-list-item-owner tw:max-w-[42%] tw:flex-none tw:overflow-hidden tw:text-ellipsis tw:text-xs tw:text-ink-muted">
                              [{ownerLabel}]
                            </span>
                          ) : null}
                          <strong>{registryListTitle(item)}</strong>
                        </span>
                        <UiTag tone={registryStatusTone(item.status)}>
                          {translateWithFallback(
                            t,
                            `registryConsole.status.${item.status}`,
                            item.status,
                          )}
                        </UiTag>
                      </span>
                      <span
                        className="automation-list-item-meta registry-list-meta tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:overflow-hidden tw:text-[11px] tw:text-ink-muted"
                        title={[meta, capabilityTitle].filter(Boolean).join(" · ")}
                      >
                        <span className="registry-list-meta-text tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                          {meta}
                        </span>
                        {chips.length ? (
                          <span
                            className="registry-capability-chips tw:inline-flex tw:flex-none tw:items-center tw:gap-1"
                            aria-label={capabilityTitle}
                          >
                            {chips.map((chip) => (
                              <RegistryCapabilityIconTag
                                key={chip.key}
                                chip={chip}
                                label={t(chip.labelKey)}
                              />
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Spin>
        </div>
      </div>
  );
}

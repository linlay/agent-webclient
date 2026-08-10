import React, { useEffect, useMemo, useRef, useState } from "react";
import { Typography } from "antd";
import type { Chat } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

const ADD_MENU_POPOVER_CLASS =
  "add-menu-popover tw:max-h-[min(360px,calc(100vh-120px))] tw:overflow-auto tw:rounded-panel tw:border tw:border-line-soft tw:bg-bg-base";
const ADD_MENU_LIST_CLASS = "add-menu-list tw:flex tw:flex-col tw:gap-1 tw:p-1";
const ADD_MENU_GROUP_LABEL_CLASS =
  "tw:px-2 tw:pb-0.5 tw:pt-1.5 tw:text-xs tw:font-bold tw:tracking-[0.08em] tw:text-text-muted tw:sticky tw:top-0 tw:bg-bg-base tw:z-10";
const ADD_MENU_ITEM_CLASS = "add-menu-item";
const ADD_MENU_ITEM_STATE_CLASS = {
  idle: "",
  active: "active tw:!bg-bg-hover",
} as const;
const ADD_MENU_ITEM_LABEL_CLASS =
  "add-menu-item-label tw:text-xs tw:text-text-main tw:!max-w-[150px]";
const ADD_MENU_ITEM_CHECK_CLASS =
  "add-menu-item-check tw:inline-flex tw:items-center tw:self-center tw:text-accent-lime tw:[&_.material-icon]:text-base";
const ADD_MENU_ITEM_SUFFIX_CLASS =
  "add-menu-item-suffix tw:text-xs tw:text-text-muted tw:flex-1";

function addMenuItemStateClass(active: boolean): string {
  return active
    ? ADD_MENU_ITEM_STATE_CLASS.active
    : ADD_MENU_ITEM_STATE_CLASS.idle;
}

export type AddMenuItem = {
  kind?: undefined;
  key: string;
  icon: MaterialIconName;
  label: string;
  disabled: boolean;
  suffix?: string;
  check?: boolean;
  action: () => void;
};

export type AddMenuGroup = {
  kind: "group";
  key: string;
  label: string;
};

export type AddMenuEntry = AddMenuItem | AddMenuGroup;

export const AddMenuContent: React.FC<{
  hashPaletteRef: React.RefObject<HTMLDivElement>;
  menuEntries: AddMenuEntry[];
  isOpen: boolean;
  filterText: string;
  emptyText: string;
  onClose: () => void;
}> = ({
  hashPaletteRef,
  menuEntries,
  isOpen,
  filterText,
  emptyText,
  onClose,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemsRef = useRef<HTMLElement[]>([]);

  const filteredEntries = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    if (!keyword) return menuEntries;

    return menuEntries.filter((entry) => {
      if (entry.kind === "group") return false;
      const item = entry as AddMenuItem;
      return item.label.toLowerCase().includes(keyword);
    });
  }, [menuEntries, filterText]);

  const actionItems = useMemo(
    () => filteredEntries.filter((e) => e.kind !== "group") as AddMenuItem[],
    [filteredEntries],
  );

  // Reset activeIndex when open changes
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (actionItems.length === 0) return;
    const idx = Math.min(activeIndex, actionItems.length - 1);
    const el = itemsRef.current[idx];
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, actionItems]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (actionItems.length > 0) {
          setActiveIndex((prev) => (prev + 1) % actionItems.length);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (actionItems.length > 0) {
          setActiveIndex(
            (prev) => (prev - 1 + actionItems.length) % actionItems.length,
          );
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const item = actionItems[activeIndex];
        if (item && !item.disabled) {
          item.action();
        }
      }
    };

    // 捕获阶段监听，确保先于 Composer 输入框的 keydown 处理
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [activeIndex, actionItems, isOpen]);

  let itemIndex = 0;

  return (
    <div ref={hashPaletteRef} className={ADD_MENU_POPOVER_CLASS}>
      <div className={ADD_MENU_LIST_CLASS} role="listbox" aria-label="Add menu">
        {filteredEntries.map((entry) => {
          if (entry.kind === "group") {
            return (
              <div key={entry.key} className={ADD_MENU_GROUP_LABEL_CLASS}>
                {entry.label}
              </div>
            );
          }

          const item = entry as AddMenuItem;
          const idx = itemIndex;
          itemIndex += 1;

          return (
            <UiButton
              key={item.key}
              ref={(ref) => ref && (itemsRef.current[idx] = ref)}
              className={`${ADD_MENU_ITEM_CLASS} ${addMenuItemStateClass(idx === activeIndex)}`}
              variant="ghost"
              size="sm"
              disabled={item.disabled}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!item.disabled) {
                  item.action();
                }
              }}
            >
              <MaterialIcon
                name={item.icon}
                className="ui-icon-hover-24 tw:text-accent"
              />
              <Typography.Text
                className={ADD_MENU_ITEM_LABEL_CLASS}
                ellipsis={{ tooltip: item.label }}
              >
                {item.label}
              </Typography.Text>
              {item.suffix ? (
                <Typography.Text
                  className={ADD_MENU_ITEM_SUFFIX_CLASS}
                  ellipsis={{
                    tooltip: {
                      title: item.suffix,
                      placement: "topRight",
                    },
                  }}
                >
                  {item.suffix}
                </Typography.Text>
              ) : null}
              {item.check ? (
                <span className={ADD_MENU_ITEM_CHECK_CLASS} aria-hidden="true">
                  <MaterialIcon name="check" />
                </span>
              ) : null}
            </UiButton>
          );
        })}
        {filteredEntries.length === 0 && (
          <div className="tw:px-2 tw:py-4 tw:text-center tw:text-xs tw:text-text-muted">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
};

// ========== AddMenuTrigger ==========

interface AddMenuTriggerProps {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}

const PLUS_BUTTON_CLASS =
  "composer-plus-btn tw:!grid tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:!place-items-center tw:!rounded-lg tw:!border-0 tw:!bg-transparent tw:!p-0 tw:!text-ink-2 tw:hover:!bg-bg-hover tw:hover:!text-ink-1 tw:[&_.material-icon]:text-lg";

export const AddMenuTrigger: React.FC<AddMenuTriggerProps> = ({
  disabled,
  loading,
  onClick,
}) => {
  const { t } = useI18n();

  return (
    <span className="composer-add-menu-trigger">
      <UiButton
        className={PLUS_BUTTON_CLASS}
        variant="ghost"
        size="sm"
        iconOnly
        loading={loading}
        disabled={disabled}
        onClick={onClick}
        aria-label={t("composer.addMenu.open")}
        title={t("composer.addMenu.open")}
      >
        <MaterialIcon name="add" />
      </UiButton>
    </span>
  );
};

// ========== Helpers ==========

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value.filter((candidate): candidate is Chat => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }
    const chatId = normalizeText((candidate as Chat).chatId);
    if (!chatId || seen.has(chatId)) {
      return false;
    }
    seen.add(chatId);
    return true;
  });
}

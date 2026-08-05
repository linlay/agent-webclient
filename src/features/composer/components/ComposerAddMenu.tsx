import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Popover, Typography } from "antd";
import type { Chat } from "@/app/state/types";
import type { ComposerContextReferenceInput } from "@/features/composer/lib/composerAttachments";
import { getChats } from "@/shared/data";
import {
  canUseDesktopWebsBridge,
  listDesktopWebEntries,
  type DesktopWebEntry,
} from "@/shared/data/desktop/desktopWebs";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

// ========== AddMenuPopover ==========

interface AddMenuPopoverProps {
  open: boolean;
  inputValue: string;
  popoverWidth?: number;
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
  hashPaletteRef: React.RefObject<HTMLDivElement>;
  currentChatId: string;
  currentAgentKey: string;
  planningMode: boolean;
  canUsePlanningMode: boolean;
  editingMode: boolean;
  canUseEditingMode: boolean;
  onOpenFilePicker: () => void;
  onAddReference: (reference: ComposerContextReferenceInput) => void;
  onTogglePlanningMode: () => void;
  onEditingModeChange: (enabled: boolean) => void;
  children: React.ReactElement;
}

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

type AddMenuItem = {
  kind?: undefined;
  key: string;
  icon: MaterialIconName;
  label: string;
  disabled: boolean;
  suffix?: string;
  check?: boolean;
  action: () => void;
};

type AddMenuGroup = {
  kind: "group";
  key: string;
  label: string;
};

type AddMenuEntry = AddMenuItem | AddMenuGroup;

const AddMenuContent: React.FC<{
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
        const item = actionItems[activeIndex];
        if (item && !item.disabled) {
          item.action();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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

export const AddMenuPopover: React.FC<AddMenuPopoverProps> = ({
  open: hashOpen,
  inputValue,
  popoverWidth,
  getPopupContainer,
  hashPaletteRef,
  currentChatId,
  currentAgentKey,
  planningMode,
  canUsePlanningMode,
  editingMode,
  canUseEditingMode,
  onOpenFilePicker,
  onAddReference,
  onTogglePlanningMode,
  onEditingModeChange,
  children,
}) => {
  const { t } = useI18n();
  const siteAvailable = canUseDesktopWebsBridge();

  const [clickOpen, setClickOpen] = useState(false);

  // Site list (loaded inline)
  const [sites, setSites] = useState<DesktopWebEntry[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState("");

  // Chat list (loaded inline)
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState("");

  const popoverOpen = hashOpen || clickOpen;

  // Snapshot inputValue when popover opens — filterText = delta after open
  const openInputRef = useRef(inputValue);
  useEffect(() => {
    if (popoverOpen) {
      openInputRef.current = inputValue;
    }
  }, [popoverOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const filterText = popoverOpen
    ? (inputValue || "").slice(openInputRef.current.length)
    : "";

  // Reset clickOpen when hash triggers
  useEffect(() => {
    if (hashOpen) {
      setClickOpen(false);
    }
  }, [hashOpen]);

  // Load chats when popover opens
  useEffect(() => {
    if (!popoverOpen) return;
    setChats([]);
    setChatsLoading(true);
    setChatsError("");
    void (async () => {
      try {
        const response = await getChats({ agentKey: currentAgentKey });
        setChats(
          normalizeChats(response.data).filter(
            (chat) =>
              normalizeText(chat.chatId) !== normalizeText(currentChatId),
          ),
        );
      } catch (error) {
        setChatsError(
          (error as Error).message || t("composer.addMenu.chat.loadFailed"),
        );
      } finally {
        setChatsLoading(false);
      }
    })();
  }, [popoverOpen, currentChatId, currentAgentKey, t]);

  // Load sites when popover opens (only if bridge available)
  useEffect(() => {
    if (!popoverOpen || !siteAvailable) return;
    setSites([]);
    setSitesLoading(true);
    setSitesError("");
    void (async () => {
      try {
        setSites(await listDesktopWebEntries());
      } catch (error) {
        setSitesError(
          (error as Error).message || t("composer.addMenu.site.loadFailed"),
        );
      } finally {
        setSitesLoading(false);
      }
    })();
  }, [popoverOpen, siteAvailable, t]);

  const closeAll = useCallback(() => {
    setClickOpen(false);
  }, []);

  const menuEntries = useMemo<AddMenuEntry[]>(() => {
    const entries: AddMenuEntry[] = [
      {
        kind: "group",
        key: "add-group",
        label: t("composer.addMenu.group.add"),
      },
      {
        key: "add:file",
        icon: "attach_file",
        label: t("composer.addMenu.file"),
        disabled: false,
        action: () => {
          closeAll();
          onOpenFilePicker();
        },
      },
      {
        key: "add:cloud",
        icon: "inventory_2",
        label: t("composer.addMenu.cloud"),
        disabled: true,
        suffix: t("composer.addMenu.comingSoon"),
        action: () => {},
      },
    ];

    // 模式切换项并入 add-group
    if (canUsePlanningMode) {
      entries.push({
        key: "add:planning",
        icon: "checklist",
        label: t("composer.addMenu.mode.planning"),
        suffix: t("composer.addMenu.mode.planning.suffix"),
        disabled: false,
        check: planningMode,
        action: () => {
          onTogglePlanningMode();
        },
      });
    } else if (canUseEditingMode) {
      entries.push({
        key: "add:editing",
        icon: "edit_square",
        label: t("composer.addMenu.mode.editing"),
        suffix: t("composer.addMenu.mode.editing.suffix"),
        disabled: false,
        check: editingMode,
        action: () => {
          onEditingModeChange(!editingMode);
        },
      });
    }

    // Site 独立 group
    if (siteAvailable) {
      entries.push({
        kind: "group",
        key: "site-group",
        label: t("composer.addMenu.group.site"),
      });

      if (sitesLoading) {
        // 加载中占位
      } else if (sitesError) {
        // 错误占位
      } else if (sites.length === 0) {
        // 空状态占位
      } else {
        for (const site of sites) {
          entries.push({
            key: `site:${site.entryKey}`,
            icon: "open_in_new",
            label: site.label,
            disabled: false,
            suffix: site.url || site.entryKey,
            action: () => {
              closeAll();
              onAddReference({
                type: "site",
                id: site.entryKey,
                name: site.label,
                ...(site.url ? { url: site.url } : {}),
                meta: {
                  kind: site.kind,
                  ...(site.updatedAt !== undefined
                    ? { updatedAt: site.updatedAt }
                    : {}),
                },
              });
            },
          });
        }
      }
    }

    // Chat 独立 group
    entries.push({
      kind: "group",
      key: "chat-group",
      label: t("composer.addMenu.group.chat"),
    });

    if (chatsLoading) {
      // 加载中占位
    } else if (chatsError) {
      // 错误占位
    } else if (chats.length === 0) {
      // 空状态占位
    } else {
      const isFiltering = filterText.trim().length > 0;
      const chatList = isFiltering ? chats : chats.slice(0, 5);
      for (const chat of chatList) {
        const chatId = normalizeText(chat.chatId);
        entries.push({
          key: `chat:${chatId}`,
          icon: "question_answer",
          label: normalizeText(chat.chatName) || chatId,
          disabled: false,
          suffix: normalizeText(chat.lastRunContent) || undefined,
          action: () => {
            closeAll();
            onAddReference({
              type: "chat",
              id: chatId,
              name: normalizeText(chat.chatName) || chatId,
              meta: {
                ...(normalizeText(chat.agentKey || chat.firstAgentKey)
                  ? {
                      agentKey: normalizeText(
                        chat.agentKey || chat.firstAgentKey,
                      ),
                    }
                  : {}),
                ...(normalizeText(chat.teamId)
                  ? { teamId: normalizeText(chat.teamId) }
                  : {}),
                ...(Number.isSafeInteger(chat.updatedAt)
                  ? { updatedAt: chat.updatedAt }
                  : {}),
              },
            });
          },
        });
      }
    }

    return entries;
  }, [
    canUseEditingMode,
    canUsePlanningMode,
    editingMode,
    planningMode,
    siteAvailable,
    t,
    closeAll,
    onOpenFilePicker,
    onTogglePlanningMode,
    onEditingModeChange,
    sites,
    sitesLoading,
    sitesError,
    chats,
    chatsLoading,
    chatsError,
    onAddReference,
    currentChatId,
    filterText,
  ]);

  return (
    <Popover
      open={popoverOpen}
      placement="topLeft"
      arrow={false}
      autoAdjustOverflow
      classNames={{ root: "composer-add-menu-popover-overlay" }}
      styles={{
        root: {
          width: popoverWidth,
          maxWidth: "calc(100vw - 24px)",
          zIndex: 1200,
        },
      }}
      getPopupContainer={getPopupContainer}
      content={
        <AddMenuContent
          hashPaletteRef={hashPaletteRef}
          menuEntries={menuEntries}
          isOpen={popoverOpen}
          filterText={filterText}
          emptyText={t("composer.addMenu.empty")}
          onClose={closeAll}
        />
      }
    >
      {children}
    </Popover>
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

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChats(value: unknown): Chat[] {
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

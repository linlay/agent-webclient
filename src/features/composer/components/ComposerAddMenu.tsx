import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MenuProps } from "antd";
import {
  Dropdown,
  Empty,
  Input,
  List,
  Modal,
  Radio,
  Spin,
} from "antd";
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

type PickerKind = "chat" | "site" | null;

interface ComposerAddMenuProps {
  disabled: boolean;
  loading: boolean;
  currentChatId: string;
  planningMode: boolean;
  canUsePlanningMode: boolean;
  editingMode: boolean;
  canUseEditingMode: boolean;
  onOpenFilePicker: () => void;
  onAddReference: (reference: ComposerContextReferenceInput) => void;
  onTogglePlanningMode: () => void;
  onEditingModeChange: (enabled: boolean) => void;
}

const PLUS_BUTTON_CLASS =
  "composer-plus-btn tw:!grid tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:!place-items-center tw:!rounded-lg tw:!border-0 tw:!bg-transparent tw:!p-0 tw:!text-ink-2 tw:hover:!bg-bg-hover tw:hover:!text-ink-1 tw:[&_.material-icon]:text-lg";

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

function itemLabel(input: {
  icon: MaterialIconName;
  title: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  return (
    <span className="composer-add-menu-item">
      <MaterialIcon name={input.icon} />
      <span className="composer-add-menu-item-title">{input.title}</span>
      {input.suffix ? (
        <span className="composer-add-menu-item-suffix">{input.suffix}</span>
      ) : null}
    </span>
  );
}

export const ComposerAddMenu: React.FC<ComposerAddMenuProps> = ({
  disabled,
  loading,
  currentChatId,
  planningMode,
  canUsePlanningMode,
  editingMode,
  canUseEditingMode,
  onOpenFilePicker,
  onAddReference,
  onTogglePlanningMode,
  onEditingModeChange,
}) => {
  const { t } = useI18n();
  const triggerWrapRef = useRef<HTMLSpanElement>(null);
  const keyboardMenuDirectionRef = useRef<"first" | "last" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<PickerKind>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [sites, setSites] = useState<DesktopWebEntry[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const siteAvailable = canUseDesktopWebsBridge();

  useEffect(() => {
    const direction = keyboardMenuDirectionRef.current;
    if (!menuOpen || !direction) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".composer-add-menu-overlay [role='menuitem']",
        ),
      ).filter(
        (item) =>
          item.getAttribute("aria-disabled") !== "true" &&
          !item.classList.contains("ant-dropdown-menu-item-disabled"),
      );
      const target =
        direction === "last" ? items[items.length - 1] : items[0];
      if (target) {
        keyboardMenuDirectionRef.current = null;
        target.focus();
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [menuOpen]);

  const openPicker = useCallback(
    (kind: Exclude<PickerKind, null>) => {
      setMenuOpen(false);
      setPickerKind(kind);
      setSearchText("");
      setSelectedId("");
      setPickerError("");
      setPickerLoading(true);
      void (async () => {
        try {
          if (kind === "chat") {
            const response = await getChats();
            setChats(
              normalizeChats(response.data).filter(
                (chat) => normalizeText(chat.chatId) !== normalizeText(currentChatId),
              ),
            );
          } else {
            setSites(await listDesktopWebEntries());
          }
        } catch (error) {
          setPickerError(
            (error as Error).message ||
              (kind === "chat"
                ? t("composer.addMenu.chat.loadFailed")
                : t("composer.addMenu.site.loadFailed")),
          );
        } finally {
          setPickerLoading(false);
        }
      })();
    },
    [currentChatId, t],
  );

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      if (!open) {
        keyboardMenuDirectionRef.current = null;
      }
    },
    [],
  );

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }
      event.preventDefault();
      keyboardMenuDirectionRef.current =
        event.key === "ArrowUp" ? "last" : "first";
      setMenuOpen(true);
    },
    [disabled],
  );

  const menuItems = useMemo<NonNullable<MenuProps["items"]>>(() => {
    const items: NonNullable<MenuProps["items"]> = [
      {
        type: "group",
        key: "add-group",
        label: t("composer.addMenu.group.add"),
        children: [
          {
            key: "add:file",
            label: itemLabel({
              icon: "description",
              title: t("composer.addMenu.file"),
            }),
          },
          {
            key: "add:cloud",
            disabled: true,
            label: itemLabel({
              icon: "inventory_2",
              title: t("composer.addMenu.cloud"),
              suffix: t("composer.addMenu.comingSoon"),
            }),
          },
          {
            key: "add:chat",
            label: itemLabel({
              icon: "question_answer",
              title: t("composer.addMenu.chat"),
            }),
          },
          {
            key: "add:site",
            disabled: !siteAvailable,
            label: itemLabel({
              icon: "open_in_new",
              title: t("composer.addMenu.site"),
              suffix: siteAvailable
                ? undefined
                : t("composer.addMenu.desktopOnly"),
            }),
          },
        ],
      },
    ];

    if (canUsePlanningMode || canUseEditingMode) {
      items.push({
        type: "group",
        key: "mode-group",
        label: t("composer.addMenu.group.mode"),
        children: canUsePlanningMode
          ? [
              {
                key: "mode:planning",
                label: itemLabel({
                  icon: "checklist",
                  title: t("composer.addMenu.mode.planning"),
                  suffix: planningMode ? <MaterialIcon name="check" /> : null,
                }),
              },
            ]
          : [
              {
                key: "mode:editing",
                label: itemLabel({
                  icon: "edit_square",
                  title: t("composer.addMenu.mode.editing"),
                  suffix: editingMode ? <MaterialIcon name="check" /> : null,
                }),
              },
            ],
      });
    }

    return items;
  }, [
    canUseEditingMode,
    canUsePlanningMode,
    editingMode,
    planningMode,
    siteAvailable,
    t,
  ]);

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    const normalizedKey = String(key);
    if (normalizedKey === "add:file") {
      setMenuOpen(false);
      onOpenFilePicker();
      return;
    }
    if (normalizedKey === "add:chat") {
      openPicker("chat");
      return;
    }
    if (normalizedKey === "add:site") {
      openPicker("site");
      return;
    }
    if (normalizedKey === "mode:planning") {
      onTogglePlanningMode();
      return;
    }
    if (normalizedKey === "mode:editing") {
      onEditingModeChange(!editingMode);
      return;
    }
  };

  const filteredItems = useMemo<Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: MaterialIconName;
  }>>(() => {
    const keyword = searchText.trim().toLowerCase();
    if (pickerKind === "chat") {
      return chats
        .filter((chat) => {
          if (!keyword) return true;
          return [
            chat.chatName,
            chat.chatId,
            chat.firstAgentName,
            chat.agentKey,
            chat.teamId,
            chat.lastRunContent,
          ].some((value) => normalizeText(value).toLowerCase().includes(keyword));
        })
        .map((chat) => ({
          id: chat.chatId,
          title: normalizeText(chat.chatName) || chat.chatId,
          subtitle:
            normalizeText(chat.lastRunContent) ||
            normalizeText(chat.firstAgentName) ||
            chat.chatId,
          icon: "question_answer",
        }));
    }
    return sites
      .filter((site) => {
        if (!keyword) return true;
        return [site.label, site.entryKey, site.url, site.kind].some((value) =>
          normalizeText(value).toLowerCase().includes(keyword),
        );
      })
      .map((site) => ({
        id: site.entryKey,
        title: site.label,
        subtitle: site.url || site.entryKey,
        icon: "open_in_new",
      }));
  }, [chats, pickerKind, searchText, sites]);

  const confirmPicker = useCallback(() => {
    if (pickerKind === "chat") {
      const chat = chats.find((item) => item.chatId === selectedId);
      if (!chat) return;
      onAddReference({
        type: "chat",
        id: chat.chatId,
        name: normalizeText(chat.chatName) || chat.chatId,
        meta: {
          ...(normalizeText(chat.agentKey || chat.firstAgentKey)
            ? { agentKey: normalizeText(chat.agentKey || chat.firstAgentKey) }
            : {}),
          ...(normalizeText(chat.teamId)
            ? { teamId: normalizeText(chat.teamId) }
            : {}),
          ...(Number.isSafeInteger(chat.updatedAt)
            ? { updatedAt: chat.updatedAt }
            : {}),
        },
      });
    } else if (pickerKind === "site") {
      const site = sites.find((item) => item.entryKey === selectedId);
      if (!site) return;
      onAddReference({
        type: "site",
        id: site.entryKey,
        name: site.label,
        ...(site.url ? { url: site.url } : {}),
        meta: {
          kind: site.kind,
          ...(site.updatedAt !== undefined ? { updatedAt: site.updatedAt } : {}),
        },
      });
    }
    setPickerKind(null);
  }, [chats, onAddReference, pickerKind, selectedId, sites]);

  const closePicker = useCallback(() => {
    setPickerKind(null);
  }, []);

  const focusTrigger = useCallback(() => {
    triggerWrapRef.current?.querySelector("button")?.focus();
  }, []);

  const pickerTitle =
    pickerKind === "chat"
      ? t("composer.addMenu.chat.modalTitle")
      : t("composer.addMenu.site.modalTitle");

  return (
    <>
      <Dropdown
        open={menuOpen}
        trigger={["click"]}
        placement="topLeft"
        overlayClassName="composer-add-menu-overlay"
        getPopupContainer={() => document.body}
        onOpenChange={handleMenuOpenChange}
        menu={{
          items: menuItems,
          onClick: handleMenuClick,
          selectable: false,
        }}
      >
        <span ref={triggerWrapRef} className="composer-add-menu-trigger">
          <UiButton
            className={PLUS_BUTTON_CLASS}
            variant="ghost"
            size="sm"
            iconOnly
            loading={loading}
            disabled={disabled}
            onKeyDown={handleTriggerKeyDown}
            aria-label={t("composer.addMenu.open")}
            title={t("composer.addMenu.open")}
          >
            <MaterialIcon name="add" />
          </UiButton>
        </span>
      </Dropdown>
      <Modal
        open={pickerKind !== null}
        title={pickerTitle}
        okText={t("composer.addMenu.confirm")}
        cancelText={t("composer.addMenu.cancel")}
        okButtonProps={{ disabled: !selectedId || pickerLoading }}
        onOk={confirmPicker}
        onCancel={closePicker}
        afterClose={focusTrigger}
        destroyOnHidden
        centered
        width={560}
        className="composer-reference-picker"
      >
        <Input
          allowClear
          autoFocus
          value={searchText}
          prefix={<MaterialIcon name="search" />}
          placeholder={
            pickerKind === "chat"
              ? t("composer.addMenu.chat.search")
              : t("composer.addMenu.site.search")
          }
          onChange={(event) => setSearchText(event.target.value)}
        />
        <div className="composer-reference-picker-list">
          {pickerLoading ? (
            <div className="composer-reference-picker-state">
              <Spin size="small" />
              <span>{t("composer.addMenu.loading")}</span>
            </div>
          ) : pickerError ? (
            <div className="composer-reference-picker-state is-error">
              {pickerError}
            </div>
          ) : filteredItems.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("composer.addMenu.empty")}
            />
          ) : (
            <List
              dataSource={filteredItems}
              renderItem={(item) => {
                return (
                  <List.Item
                    className={`composer-reference-picker-row${selectedId === item.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <Radio checked={selectedId === item.id} />
                    <span className="composer-reference-picker-icon">
                      <MaterialIcon name={item.icon} />
                    </span>
                    <span className="composer-reference-picker-copy">
                      <span className="composer-reference-picker-title">
                        {item.title}
                      </span>
                      <span className="composer-reference-picker-subtitle">
                        {item.subtitle}
                      </span>
                    </span>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </Modal>
    </>
  );
};

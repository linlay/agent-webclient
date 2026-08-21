import { useEffect, useMemo, useState } from "react";
import type { Chat } from "@/app/state/types";
import type { ComposerContextReferenceInput } from "@/features/composer/lib/composerAttachments";
import {
  AddMenuContent,
  type AddMenuEntry,
  normalizeText,
  normalizeChats,
} from "@/features/composer/components/ComposerAddMenu";
import type { ComposerPanel } from "@/features/composer/components/ComposerPopover";
import { getChats } from "@/shared/data";
import {
  canUseDesktopWebsBridge,
  listDesktopWebEntries,
  type DesktopWebEntry,
} from "@/shared/data/desktop/desktopWebs";
import { useI18n } from "@/shared/i18n";
import { useComposerFilter } from "@/features/composer/hooks/useComposerFilter";

interface UseAddMenuPanelInput {
  open: boolean;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  currentChatId: string;
  currentAgentKey: string;
  hashPaletteRef: React.RefObject<HTMLDivElement>;
  planningMode: boolean;
  editingMode: boolean;
  canUsePlanningMode: boolean;
  canUseEditingMode: boolean;
  onOpenFilePicker: () => void;
  onAddReference: (reference: ComposerContextReferenceInput) => void;
  onTogglePlanningMode: () => void;
  onEditingModeChange: (enabled: boolean) => void;
  onClose: () => void;
}

export function useAddMenuPanel(input: UseAddMenuPanelInput): ComposerPanel {
  const {
    open,
    inputValue,
    currentChatId,
    currentAgentKey,
    hashPaletteRef,
    planningMode,
    editingMode,
    canUsePlanningMode,
    canUseEditingMode,
    onOpenFilePicker,
    onAddReference,
    onTogglePlanningMode,
    onEditingModeChange,
    onClose,
    setInputValue,
  } = input;

  const { t } = useI18n();
  const siteAvailable = canUseDesktopWebsBridge();

  const [sites, setSites] = useState<DesktopWebEntry[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState("");

  const { filterText, startIndex: filterStartIndex } = useComposerFilter(
    open,
    inputValue,
    inputValue.lastIndexOf("#") >= 0
      ? inputValue.lastIndexOf("#") + 1
      : inputValue.length,
  );

  // Load chats
  useEffect(() => {
    if (!open) return;
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
  }, [open, currentChatId, currentAgentKey, t]);

  // Load sites
  useEffect(() => {
    if (!open || !siteAvailable) return;
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
  }, [open, siteAvailable, t]);

  const addMenuEntries = useMemo<AddMenuEntry[]>(() => {
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
          setInputValue((current) => current.slice(0, filterStartIndex - 1));
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

    if (siteAvailable) {
      entries.push({
        kind: "group",
        key: "site-group",
        label: t("composer.addMenu.group.site"),
      });
      if (!sitesLoading && !sitesError && sites.length > 0) {
        for (const site of sites) {
          entries.push({
            key: `site:${site.entryKey}`,
            icon: "open_in_new",
            label: site.label,
            disabled: false,
            suffix: site.url || site.entryKey,
            action: () => {
              setInputValue((current) => current.slice(0, filterStartIndex - 1));
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

    entries.push({
      kind: "group",
      key: "chat-group",
      label: t("composer.addMenu.group.chat"),
    });

    if (!chatsLoading && !chatsError && chats.length > 0) {
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
            setInputValue((current) => current.slice(0, filterStartIndex - 1));
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

  return {
    open,
    content: (
      <AddMenuContent
        hashPaletteRef={hashPaletteRef}
        menuEntries={addMenuEntries}
        isOpen={open}
        filterText={filterText}
        emptyText={t("composer.addMenu.empty")}
        onClose={onClose}
      />
    ),
  };
}

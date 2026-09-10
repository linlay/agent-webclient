import { App as AntdApp } from "antd";
import React, { useEffect, useRef, useState } from "react";
import { Dropdown, Input, message, type MenuProps } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";
import {
  getChat,
  type ChatDetailResponse,
} from "@/shared/data";
import { CopyInfoModal } from "@/shared/ui/CopyInfoModal";
import { buildChatCopyInfoGroups } from "@/features/chats/lib/chatCopyInfo";
import { UiButton } from "@/shared/ui/UiButton";
import { useChatOperations } from "@/features/chats/hooks/useChatOperations";

import { useChatPinActions } from "@/features/chats/hooks/useChatPinActions";

export const ChatActionsMenu: React.FC<{
  chatId: string;
  chatName?: string;
  agentKey?: string;
  triggerClassName?: string;
  iconHover24?: boolean;
  onArchived?: (chatId: string) => void;
  onDeleted?: (chatId: string) => void;
}> = ({
  chatId,
  chatName,
  agentKey,
  triggerClassName,
  iconHover24 = false,
  onArchived,
  onDeleted,
}) => {
  const { modal } = AntdApp.useApp();
  const { state, dispatch } = useAppContext();
  const { pending, archive, remove, rename, exportChat } = useChatOperations(
    state.chatId, dispatch, t,
  );
  const pinActions = useChatPinActions();
  const isPinned = state.chatPinnedOrder?.includes(chatId) ?? false;
  const pinningSupported = Array.isArray(state.chatPinnedOrder);
  const [copyInfoOpen, setCopyInfoOpen] = useState(false);
  const [copyInfoDetail, setCopyInfoDetail] =
    useState<ChatDetailResponse | null>(null);
  const [copyInfoLoading, setCopyInfoLoading] = useState(false);
  const [copyInfoError, setCopyInfoError] = useState("");
  const copyInfoRequestRef = useRef(0);
  useEffect(
    () => () => {
      copyInfoRequestRef.current += 1;
    },
    [],
  );
  const normalizedChatId = String(chatId || "").trim();
  const triggerClass = [
    "chat-actions-trigger",
    triggerClassName,
    iconHover24 ? "ui-icon-hover-24" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const menuItemClassName = iconHover24 ? "ui-icon-hover-24" : undefined;
  const menuIconClassName = iconHover24 ? "ui-icon-hover-24-target" : undefined;

  const handleRename = () => {
    if (!normalizedChatId || pending) return;
    let nextName = String(chatName || "").trim();
    modal.confirm({
      title: t("chatActions.rename.title"),
      content: (
        <Input
          autoFocus
          defaultValue={nextName}
          maxLength={120}
          placeholder={t("chatActions.rename.placeholder")}
          onChange={(event) => {
            nextName = event.target.value;
          }}
        />
      ),
      okText: t("chatActions.rename.ok"),
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        const chatName = nextName.trim();
        if (!chatName) {
          throw new Error(t("chatActions.rename.required"));
        }
        await rename(normalizedChatId, chatName);
      },
    });
  };

  const handleDelete = () => {
    if (!normalizedChatId || pending) return;
    modal.confirm({
      title: t("chatActions.delete.title"),
      content: chatName || normalizedChatId,
      okText: t("chatActions.delete.ok"),
      okButtonProps: { danger: true },
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        await remove(normalizedChatId, onDeleted);
      },
    });
  };

  const handleArchive = () => {
    if (!normalizedChatId || pending) return;
    void archive(normalizedChatId, onArchived).catch(() => {
      message.error(t("chatActions.archive.failed"));
    });
  };

  const handleExport = async (format: "markdown" | "html") => {
    if (!normalizedChatId || pending) return;
    try {
      await exportChat(normalizedChatId, format);
      message.success(
        t(format === "html"
          ? "chatActions.exportHtml.success"
          : "chatActions.export.success"),
      );
    } catch {
      message.error(
        t(format === "html"
          ? "chatActions.exportHtml.failed"
          : "chatActions.export.failed"),
      );
    }
  };

  const loadCopyInfoDetail = () => {
    if (!normalizedChatId) return;
    const requestId = copyInfoRequestRef.current + 1;
    copyInfoRequestRef.current = requestId;
    setCopyInfoLoading(true);
    setCopyInfoError("");
    setCopyInfoDetail(null);
    void getChat(normalizedChatId, false)
      .then((response) => {
        if (copyInfoRequestRef.current !== requestId) return;
        setCopyInfoDetail(response.data);
      })
      .catch((error) => {
        if (copyInfoRequestRef.current !== requestId) return;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setCopyInfoError(errorMessage);
        dispatch({
          type: "APPEND_DEBUG",
          line: `[load chat copy detail error] ${errorMessage}`,
        });
      })
      .finally(() => {
        if (copyInfoRequestRef.current === requestId) {
          setCopyInfoLoading(false);
        }
      });
  };

  const handleCopyInfo = () => {
    if (!normalizedChatId) return;
    setCopyInfoOpen(true);
    loadCopyInfoDetail();
  };

  const handleCloseCopyInfo = () => {
    copyInfoRequestRef.current += 1;
    setCopyInfoOpen(false);
    setCopyInfoDetail(null);
    setCopyInfoLoading(false);
    setCopyInfoError("");
  };

  const handleMenuClick: MenuProps["onClick"] = (info) => {
    info.domEvent.stopPropagation();
    switch (info.key) {
      case "pin":
        if (!normalizedChatId || pinActions.pending || !pinningSupported) return;
        void pinActions.update({ operation: "set_pinned", chatId: normalizedChatId, pinned: !isPinned })
          .catch(() => message.error(t("chatActions.pin.failed")));
        break;
      case "export":
        void handleExport("markdown");
        break;
      case "exportHtml":
        void handleExport("html");
        break;
      case "rename":
        handleRename();
        break;
      case "archive":
        handleArchive();
        break;
      case "delete":
        handleDelete();
        break;
      case "copyInfo":
        handleCopyInfo();
        break;
    }
  };

  const items: MenuProps["items"] = [
    ...(pinningSupported ? [{
      key: "pin",
      className: menuItemClassName,
      icon: <MaterialIcon name="push_pin" className={menuIconClassName} />,
      label: t(isPinned ? "chatActions.unpin" : "chatActions.pin"),
      disabled: pending || pinActions.pending,
    }] : []),
    {
      key: "exportGroup",
      className: menuItemClassName,
      icon: <MaterialIcon name="export" className={menuIconClassName} />,
      label: t("chatActions.export.menu"),
      children: [
        {
          key: "export",
          className: menuItemClassName,
          label: t("chatActions.export"),
        },
        {
          key: "exportHtml",
          className: menuItemClassName,
          label: t("chatActions.exportHtml"),
        },
      ],
    },
    {
      key: "rename",
      className: menuItemClassName,
      icon: <MaterialIcon name="rename" className={menuIconClassName} />,
      label: t("chatActions.rename.menu"),
    },
    {
      key: "archive",
      className: menuItemClassName,
      icon: <MaterialIcon name="inventory_2" className={menuIconClassName} />,
      label: t("chatActions.archive.menu"),
    },
    {
      key: "delete",
      danger: true,
      className: menuItemClassName,
      icon: <MaterialIcon name="delete" className={menuIconClassName} />,
      label: t("chatActions.delete.menu"),
    },
    {
      key: "copyInfo",
      className: menuItemClassName,
      icon: <MaterialIcon name="content_copy" className={menuIconClassName} />,
      label: t("chatActions.copyInfo"),
    },
  ];

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dropdown
        menu={{ items, onClick: handleMenuClick }}
        trigger={["click"]}
        onOpenChange={(open) => {
          if (open && !pinningSupported) {
            window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
          }
        }}
        placement="bottomRight"
      >
        <UiButton
          size="mini"
          variant="ghost"
          className={triggerClass}
          iconOnly
          loading={pending}
        >
          <MaterialIcon name="more_horiz" className={menuIconClassName} />
        </UiButton>
      </Dropdown>
      <CopyInfoModal
        open={copyInfoOpen}
        title={t("chatCopy.title")}
        groups={buildChatCopyInfoGroups({
          summary: { chatId: normalizedChatId, chatName, agentKey },
          detail: copyInfoDetail,
          t,
        })}
        rawData={copyInfoDetail}
        rawReady={Boolean(copyInfoDetail)}
        loading={copyInfoLoading}
        error={copyInfoError}
        onRetry={loadCopyInfoDetail}
        onClose={handleCloseCopyInfo}
      />
    </div>
  );
};

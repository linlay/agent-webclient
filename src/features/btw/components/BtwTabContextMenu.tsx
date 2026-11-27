import React from "react";
import { App as AntdApp, Dropdown, Modal, type MenuProps } from "antd";
import type { BTWSessionState } from "@/features/btw/lib/btwTypes";
import {
  canResetBtwBranch,
  getLatestBtwAnswer,
} from "@/features/btw/lib/btwSession";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { copyText } from "@/shared/utils/copy";

type AntdAppModalHook = {
  useApp?: () => { modal?: { confirm: typeof Modal.confirm } };
};

export const BtwTabContextMenu: React.FC<{
  chatId: string;
  session: BTWSessionState | null;
  children: React.ReactElement;
  onOpenStandalone: () => void;
  onNewBranch: () => boolean;
  onClose: () => void;
}> = ({
  chatId,
  session,
  children,
  onOpenStandalone,
  onNewBranch,
  onClose,
}) => {
  const { t } = useI18n();
  const message = useAppMessage();
  const appModal = (AntdApp as unknown as AntdAppModalHook)?.useApp?.()?.modal;
  const [open, setOpen] = React.useState(false);

  const running = session?.status === "running";
  const latestAnswer = React.useMemo(
    () => getLatestBtwAnswer(session),
    [session],
  );
  const canReset = canResetBtwBranch(session);

  const handleNewBranch = () => {
    const confirm = appModal?.confirm ?? Modal?.confirm;
    const execute = () => {
      if (onNewBranch()) {
        void message.success(t("btw.new.created"));
      }
    };
    if (typeof confirm !== "function") {
      execute();
      return;
    }
    confirm({
      title: t("btw.new.confirmTitle"),
      content: t("btw.new.confirmDescription"),
      okText: t("btw.new.confirm"),
      cancelText: t("btw.new.cancel"),
      onOk: execute,
    });
  };

  const items: MenuProps["items"] = [
    {
      key: "copyLatestAnswer",
      label: t("btw.copyLatestAnswer"),
      icon: <MaterialIcon name="content_copy" className="tw:opacity-[0.5]" />,
      disabled: !latestAnswer,
      onClick: () => void copyText(latestAnswer),
    },
    {
      key: "openStandalone",
      label: t("btw.openStandalone"),
      icon: <MaterialIcon name="open_in_new" className="tw:opacity-[0.5]" />,
      disabled: !chatId || !session,
      onClick: onOpenStandalone,
    },
    {
      key: "newBranch",
      label: t("btw.new.action"),
      icon: <MaterialIcon name="add" className="tw:opacity-[0.5]" />,
      disabled: running || !canReset,
      onClick: handleNewBranch,
    },
    { type: "divider", key: "close-divider" },
    {
      key: "close",
      label: t("rightSidebar.web.contextMenu.close"),
      icon: <MaterialIcon name="close" className="tw:opacity-[0.5]" />,
      onClick: onClose,
    },
  ];

  return (
    <Dropdown
      open={open}
      trigger={["contextMenu"]}
      overlayStyle={{ minWidth: 140 }}
      menu={{ items, onClick: () => setOpen(false) }}
      onOpenChange={setOpen}
    >
      {children}
    </Dropdown>
  );
};

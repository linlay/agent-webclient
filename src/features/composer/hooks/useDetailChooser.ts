import { createElement, useCallback } from "react";
import { App as AntdApp } from "antd";
import type { EventDetailLevel } from "@/shared/data/eventDetailLevel";
import { useI18n } from "@/shared/i18n";
import { DetailChooserContent } from "@/features/composer/components/DetailChooserContent";
import styles from "@/features/composer/components/CompactChooser.module.css";

/** Reloads an idle Chat at another level; Platform ignores it while a Run is active. */
export function reloadChatAtDetail(chatId: string, level: EventDetailLevel): void {
  window.dispatchEvent(new CustomEvent("agent:load-chat", {
    detail: { chatId, forceReload: true, focusComposerOnComplete: false, detail: level },
  }));
}

export function useDetailChooser() {
  const { modal } = AntdApp.useApp();
  const { t } = useI18n();

  return useCallback((chatId: string, current: EventDetailLevel) => {
    let settled = false;
    const dialog = modal.confirm({
      title: t("detailChooser.title"),
      className: styles.dialog,
      width: 480,
      centered: true,
      icon: null,
      closable: true,
      autoFocusButton: null,
      footer: null,
      onCancel: () => { settled = true; },
      content: createElement(DetailChooserContent, {
        current,
        onSelect: (level: EventDetailLevel) => {
          if (settled) return;
          settled = true;
          dialog.destroy();
          reloadChatAtDetail(chatId, level);
        },
      }),
    });
  }, [modal, t]);
}

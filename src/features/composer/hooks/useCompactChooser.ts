import { createElement, useCallback } from "react";
import { App as AntdApp } from "antd";
import type { CompactLevel } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { CompactChooserContent } from "@/features/composer/components/CompactChooserContent";
import styles from "@/features/composer/components/CompactChooser.module.css";

export function useCompactChooser(onSelect: (level: CompactLevel) => void | Promise<void>) {
  const { modal } = AntdApp.useApp();
  const { t } = useI18n();

  return useCallback(async () => {
    let settled = false;
    const dialog = modal.confirm({
      title: t("contextCompact.chooser.title"),
      className: styles.dialog,
      width: 480,
      centered: true,
      icon: null,
      closable: true,
      autoFocusButton: null,
      footer: null,
      onCancel: () => { settled = true; },
      content: createElement(CompactChooserContent, {
        onSelect: (level: CompactLevel) => {
          if (settled) return;
          settled = true;
          dialog.destroy();
          void onSelect(level);
        },
      }),
    });
  }, [modal, onSelect, t]);
}

import React, { useState } from "react";
import { Modal } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type { PastedText } from "../lib/pastedText";
import styles from "./ComposerPastedTexts.module.css";

interface ComposerPastedTextsProps {
  pastes: PastedText[];
  disabled: boolean;
  onRemove: (id: string) => void;
  onExpand: (id: string) => void;
}

export function ComposerPastedTexts({ pastes, disabled, onRemove, onExpand }: ComposerPastedTextsProps) {
  const { t } = useI18n();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = pastes.find(paste => paste.id === previewId);
  if (!pastes.length) return null;

  return <>
    <div className={styles.cards} aria-label={t("composer.pastedText.label")}>
      {pastes.map(paste => {
        const title = paste.text.trimStart().split(/[\r\n]/, 1)[0].slice(0, 120);
        return <div key={paste.id} className={styles.card}>
          <button type="button" className={styles.preview} onClick={() => setPreviewId(paste.id)}
            aria-label={t("composer.pastedText.preview", { title })}>
            <span className={styles.icon}><MaterialIcon name="description" /></span>
            <span className={styles.copy}>
              <span className={styles.title}>{title}</span>
              <span className={styles.subtitle}>{t("composer.pastedText.label")} · {t("composer.pastedText.characters", { count: paste.text.length.toLocaleString() })}</span>
            </span>
          </button>
          <button type="button" className={styles.remove} disabled={disabled} onClick={() => onRemove(paste.id)}
            aria-label={t("composer.pastedText.remove", { title })}>
            <MaterialIcon name="close" />
          </button>
        </div>;
      })}
    </div>
    {preview ? <Modal open title={t("composer.pastedText.label")} onCancel={() => setPreviewId(null)}
      width={760} centered className={styles.modal}
      footer={<UiButton disabled={disabled} onClick={() => { onExpand(preview.id); setPreviewId(null); }}>
        {t("composer.pastedText.expand")}
      </UiButton>}>
      <div className={styles.details}>{t("composer.pastedText.characters", { count: preview.text.length.toLocaleString() })}</div>
      <pre className={styles.content} tabIndex={0}>{preview.text}</pre>
    </Modal> : null}
  </>;
}

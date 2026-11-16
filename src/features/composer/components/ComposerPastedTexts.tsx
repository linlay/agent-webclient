import React, { useState } from "react";
import { Modal } from "antd";
import attachmentStyles from "@/features/artifacts/components/AttachmentCard.module.css";
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
  inline?: boolean;
}

/** 复用附件卡 composer 文件卡的语义类，避免粘贴文本卡与附件卡外观漂移。 */
function withAttachmentCardClasses(...classNames: string[]): string {
  return classNames
    .flatMap((className) => [className, attachmentStyles[className]])
    .filter(Boolean)
    .join(" ");
}

const CARD_CLASS = `${withAttachmentCardClasses("attachment-card", "attachment-card-composer", "is-file", "is-interactive")} ${styles.card}`;
const PREVIEW_CLASS = `${withAttachmentCardClasses("attachment-card-file-shell")} ${styles.preview}`;
const ICON_CLASS = withAttachmentCardClasses("attachment-card-file-icon");
const COPY_CLASS = withAttachmentCardClasses("attachment-card-file-copy");
const TITLE_CLASS = withAttachmentCardClasses("attachment-card-title");
const NAME_CLASS = withAttachmentCardClasses("attachment-card-name");
const SUBTITLE_CLASS = withAttachmentCardClasses("attachment-card-subtitle");
const REMOVE_CLASS = `${withAttachmentCardClasses("attachment-card-remove")} ${styles.remove}`;

export function ComposerPastedTexts({ pastes, disabled, onRemove, onExpand, inline = false }: ComposerPastedTextsProps) {
  const { t } = useI18n();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = pastes.find(paste => paste.id === previewId);
  if (!pastes.length) return null;

  const cards = pastes.map(paste => {
    const firstLine = paste.text.trimStart().split(/[\r\n]/, 1)[0].slice(0, 120);
    const title = firstLine || t("composer.pastedText.label");
    const subtitle = `${t("composer.pastedText.label")} · ${t("composer.pastedText.characters", { count: paste.text.length.toLocaleString() })}`;
    return <div key={paste.id} className={CARD_CLASS}>
      <button type="button" className={PREVIEW_CLASS} onClick={() => setPreviewId(paste.id)}
        aria-label={t("composer.pastedText.preview", { title })}>
        <span className={ICON_CLASS} aria-hidden="true"><MaterialIcon name="description" /></span>
        <span className={COPY_CLASS}>
          <span className={TITLE_CLASS} title={title}><span className={NAME_CLASS}>{title}</span></span>
          <span className={SUBTITLE_CLASS} title={subtitle}>{subtitle}</span>
        </span>
      </button>
      <button type="button" className={REMOVE_CLASS} disabled={disabled} onClick={() => onRemove(paste.id)}
        aria-label={t("composer.pastedText.remove", { title })} title={t("composer.pastedText.removeTitle")}>
        <MaterialIcon name="close" />
      </button>
    </div>;
  });

  return <>
    {inline ? cards : <div className={styles.cards} aria-label={t("composer.pastedText.label")}>{cards}</div>}
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

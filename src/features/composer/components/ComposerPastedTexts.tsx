import React, { useState } from "react";
import type { KeyboardEvent } from "react";
import { Modal } from "antd";
import attachmentStyles from "@/features/artifacts/components/AttachmentCard.module.css";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import { copyWebText } from "@/shared/utils/webClipboard";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import type { PastedText } from "../lib/pastedText";
import styles from "./ComposerPastedTexts.module.css";

interface ComposerPastedTextsProps {
  pastes: PastedText[];
  disabled: boolean;
  onRemove: (id: string) => void;
  onSave: (id: string, text: string) => void;
  onExpand: (id: string, text: string) => void;
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

export function ComposerPastedTexts({ pastes, disabled, onRemove, onSave, onExpand, inline = false }: ComposerPastedTextsProps) {
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
    {preview ? <PastedTextEditor key={preview.id} text={preview.text} disabled={disabled}
      onClose={() => setPreviewId(null)}
      onSave={text => { onSave(preview.id, text); setPreviewId(null); }}
      onExpand={text => { onExpand(preview.id, text); setPreviewId(null); }} /> : null}
  </>;
}

interface PastedTextEditorProps {
  text: string;
  disabled: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
  onExpand: (text: string) => void;
}

const MOD_KEY_LABEL = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

/** 弹窗内直接编辑粘贴正文；保存前的修改只存在于本地，取消即丢弃。 */
function PastedTextEditor({ text, disabled, onClose, onSave, onExpand }: PastedTextEditorProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  const dirty = value !== text;
  const lines = value ? value.split(/\r\n|\r|\n/).length : 0;
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && dirty && !disabled) {
      event.preventDefault();
      onSave(value);
    }
  };
  const copy = () => {
    void copyWebText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };
  const title = <div className={styles.header}>
    <span className={styles.headerIcon} aria-hidden="true"><MaterialIcon name="description" /></span>
    <span className={styles.headerCopy}>
      <span className={styles.headerTitle}>{t("composer.pastedText.label")}</span>
      <span className={styles.headerMeta}>
        {t("composer.pastedText.characters", { count: value.length.toLocaleString() })}
        <span className={styles.dot} aria-hidden="true" />
        {t("composer.pastedText.lines", { count: lines.toLocaleString() })}
        {dirty ? <span className={styles.dirty}>{t("composer.pastedText.modified")}</span> : null}
      </span>
    </span>
  </div>;
  return <Modal open title={title} onCancel={onClose} maskClosable={!dirty}
    width={860} centered className={styles.modal}
    footer={<div className={styles.footer}>
      <span className={styles.hint}>
        <kbd className={styles.kbd}>{MOD_KEY_LABEL}</kbd><kbd className={styles.kbd}>Enter</kbd>
        <span>{t("composer.pastedText.save")}</span>
        <span className={styles.dot} aria-hidden="true" />
        <kbd className={styles.kbd}>Esc</kbd>
        <span>{t("composer.pastedText.cancel")}</span>
      </span>
      <span className={styles.actions}>
        <UiButton variant="ghost" disabled={disabled} onClick={() => onExpand(value)}>
          {t("composer.pastedText.expand")}
        </UiButton>
        <UiButton onClick={onClose}>{t("composer.pastedText.cancel")}</UiButton>
        <UiButton variant="primary" color="accent" disabled={disabled || !dirty} onClick={() => onSave(value)}
          title={t("composer.pastedText.saveShortcut")}>
          {t("composer.pastedText.save")}
        </UiButton>
      </span>
    </div>}>
    <div className={styles.editor}>
      <textarea className={`${styles.content} ${SCROLLBAR_THIN_CLASS_NAME}`} value={value} readOnly={disabled}
        spellCheck={false} aria-label={t("composer.pastedText.label")}
        onChange={event => setValue(event.target.value)} onKeyDown={handleKeyDown} />
      <button type="button" className={styles.copy} onClick={copy}
        aria-label={t("composer.pastedText.copy")} title={t("composer.pastedText.copy")}>
        <MaterialIcon name={copied ? "check" : "content_copy"} />
      </button>
    </div>
  </Modal>;
}

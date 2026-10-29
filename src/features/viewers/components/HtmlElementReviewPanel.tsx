import React from "react";
import { Button, Input, Modal } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useI18n } from "@/shared/i18n";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import {
  HTML_ELEMENT_REQUIREMENT_MAX,
  type HtmlElementReviewAnnotation,
  type HtmlElementReviewPending,
} from "../lib/htmlElementReview";

async function copyLocator(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy selection copy path.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

function NumberBadge({ number }: { number: number }) {
  return (
    <span
      aria-hidden="true"
      className="tw:inline-flex tw:h-5 tw:w-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-[var(--accent-danger)] tw:text-xs tw:text-white"
    >
      {number}
    </span>
  );
}

/** The annotation list lives in its own Popover; it never hosts the pending editor. */
export const HtmlElementReviewPanel: React.FC<{
  annotations: readonly HtmlElementReviewAnnotation[];
  invalidIds: readonly string[];
  canHandoff: boolean;
  submittableCount: number;
  onUpdateRequirement: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onHandoff: () => void;
}> = ({
  annotations,
  invalidIds,
  canHandoff,
  submittableCount,
  onUpdateRequirement,
  onRemove,
  onClose,
  onHandoff,
}) => {
  const { t } = useI18n();
  const message = useAppMessage();

  const copy = async (value: string) => {
    const ok = await copyLocator(value);
    if (ok) message.success(t("contentViewer.htmlReview.copied"));
    else message.error(t("contentViewer.htmlReview.copyFailed"));
  };

  return (
    <div
      role="dialog"
      aria-label={t("contentViewer.htmlReview.listLabel")}
      style={{ width: "min(368px, calc(100vw - 32px))", maxHeight: "min(70vh, 560px)" }}
      className="tw:flex tw:flex-col tw:overflow-hidden tw:rounded-xl tw:bg-bg-elev-1"
    >
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-3 tw:py-2.5">
        <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
          <span className="tw:truncate tw:text-sm tw:font-semibold tw:text-ink-1">
            {t("contentViewer.htmlReview.panelTitle")}
          </span>
          <span className="tw:shrink-0 tw:text-xs tw:text-ink-muted" aria-live="polite">
            {t("contentViewer.htmlReview.listTotal", { count: annotations.length })}
          </span>
        </div>
        <Button
          size="small"
          type="text"
          aria-label={t("contentViewer.htmlReview.closePanel")}
          title={t("contentViewer.htmlReview.closePanel")}
          icon={<MaterialIcon name="close" />}
          onClick={onClose}
        />
      </div>

      <div className="tw:min-h-0 tw:flex-1 tw:overflow-auto tw:px-3 tw:py-3 tw:space-y-4">
        {annotations.length === 0 ? (
          <div className="tw:flex tw:min-h-40 tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:text-center">
            <span className="tw:text-sm tw:font-semibold tw:text-ink-1">
              {t("contentViewer.htmlReview.empty")}
            </span>
            <span className="tw:text-xs tw:text-ink-muted">
              {t("contentViewer.htmlReview.emptyHint")}
            </span>
          </div>
        ) : null}

        {annotations.map((annotation) => {
          const invalid = invalidIds.includes(annotation.id);
          const locator = annotation.cssSelector || annotation.fullXPath;
          return (
            <section
              key={annotation.id}
              aria-label={t("contentViewer.htmlReview.annotationLabel", { number: annotation.number })}
              className="tw:flex tw:items-start tw:gap-2"
            >
              <NumberBadge number={annotation.number} />
              <div className="tw:min-w-0 tw:flex-1">
                <div className="tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:bg-accent-soft tw:pl-2.5">
                  <button
                    type="button"
                    onClick={() => void copy(locator)}
                    title={locator}
                    aria-label={t("contentViewer.htmlReview.copyLocator")}
                    className="tw:min-w-0 tw:flex-1 tw:truncate tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:font-code tw:text-[12px] tw:text-ink-muted"
                  >
                    {locator}
                  </button>
                  <Button
                    size="small"
                    type="text"
                    danger
                    aria-label={t("contentViewer.htmlReview.remove")}
                    title={t("contentViewer.htmlReview.remove")}
                    icon={<MaterialIcon name="delete" />}
                    onClick={() => onRemove(annotation.id)}
                  />
                </div>

                {annotation.textExcerpt ? (
                  <p className="tw:mt-1.5 tw:mb-0 tw:text-[13px] tw:text-ink-1">
                    {annotation.textExcerpt}
                  </p>
                ) : null}

                {invalid ? (
                  <div className="tw:mt-1.5 tw:flex tw:items-center tw:gap-2">
                    <span className="tw:text-[11px] tw:font-semibold tw:text-danger">
                      {t("contentViewer.htmlReview.invalid")}
                    </span>
                    <Button size="small" type="link" onClick={() => onRemove(annotation.id)}>
                      {t("contentViewer.htmlReview.reselect")}
                    </Button>
                  </div>
                ) : null}

                <Input.TextArea
                  className="tw:mt-1.5"
                  value={annotation.requirement}
                  maxLength={HTML_ELEMENT_REQUIREMENT_MAX}
                  disabled={invalid}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder={t("contentViewer.htmlReview.requirementPlaceholder")}
                  aria-label={t("contentViewer.htmlReview.requirementLabel", { number: annotation.number })}
                  onChange={(event) => onUpdateRequirement(annotation.id, event.target.value)}
                />
              </div>
            </section>
          );
        })}
      </div>

      <div className="tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:gap-3 tw:border-t tw:border-line-soft tw:px-2 tw:py-2">
        <span className="tw:text-xs tw:text-ink-muted">
          {t("contentViewer.htmlReview.handoffCount", { count: submittableCount })}
        </span>
        <Button type="primary" size="small" disabled={!canHandoff} onClick={onHandoff}>
          {t("contentViewer.htmlReview.handoff")}
        </Button>
      </div>
    </div>
  );
};

/** The pending editor is a centered modal opened by selecting an element. */
export const HtmlElementReviewEditor: React.FC<{
  pending: HtmlElementReviewPending;
  onRequirementChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ pending, onRequirementChange, onConfirm, onCancel }) => {
  const { t } = useI18n();
  const message = useAppMessage();
  const pendingInput = React.useRef<TextAreaRef>(null);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      pendingInput.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pending.selection.fullXPath]);

  const pendingText = pending.requirement;
  const canConfirm = Boolean(pendingText.trim());
  const locator = pending.selection.cssSelector || pending.selection.fullXPath;

  const copy = async () => {
    const ok = await copyLocator(locator);
    if (ok) message.success(t("contentViewer.htmlReview.copied"));
    else message.error(t("contentViewer.htmlReview.copyFailed"));
  };

  return (
    <Modal
      open
      width={520}
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard
      onCancel={onCancel}
      destroyOnHidden
      styles={{
        mask: {
          background: "color-mix(in srgb, var(--bg-base) 55%, transparent)",
          backdropFilter: "blur(3px)",
        },
        content: { padding: 0, borderRadius: 14 },
        body: { padding: 0 },
      }}
    >
      <div className="tw:flex tw:flex-col tw:p-5">
        <div className="tw:mb-4 tw:flex tw:items-center tw:justify-between tw:gap-3">
          <h2 className="tw:m-0 tw:text-base tw:font-semibold tw:text-ink-1">
            {t("contentViewer.htmlReview.editorTitle")}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("contentViewer.htmlReview.closeEditor")}
            className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-xs tw:text-ink-muted"
          >
            {t("contentViewer.htmlReview.escClose")}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void copy()}
          title={t("contentViewer.htmlReview.copyLocator")}
          aria-label={t("contentViewer.htmlReview.copyLocator")}
          className="tw:flex tw:w-full tw:min-w-0 tw:rounded-lg tw:border-none tw:bg-accent-soft tw:px-3 tw:py-2 tw:text-left tw:font-code tw:text-[12px] tw:text-ink-muted"
        >
          <span className="tw:block tw:w-full tw:truncate">{locator}</span>
        </button>

        {pending.selection.textExcerpt ? (
          <p className="tw:mt-3 tw:mb-0 tw:text-sm tw:text-ink-1">
            {pending.selection.textExcerpt}
          </p>
        ) : null}

        <Input.TextArea
          ref={pendingInput}
          className="tw:mt-2"
          value={pendingText}
          maxLength={HTML_ELEMENT_REQUIREMENT_MAX}
          autoSize={{ minRows: 3, maxRows: 8 }}
          placeholder={t("contentViewer.htmlReview.editorPlaceholder")}
          aria-label={t("contentViewer.htmlReview.requirement")}
          autoFocus
          onChange={(event) => onRequirementChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
              return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              if (canConfirm) onConfirm();
            }
          }}
        />

        <div className="tw:mt-4 tw:flex tw:justify-end tw:gap-2">
          <Button onClick={onCancel}>{t("contentViewer.htmlReview.cancel")}</Button>
          <Button type="primary" disabled={!canConfirm} onClick={onConfirm}>
            {t("contentViewer.htmlReview.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

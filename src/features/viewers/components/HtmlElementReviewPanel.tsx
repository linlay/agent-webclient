import React from "react";
import { Button, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import {
  HTML_ELEMENT_REQUIREMENT_MAX,
  HTML_REVIEW_EDITOR_WIDTH,
  placeHtmlReviewEditor,
  type HtmlElementReviewAnnotation,
  type HtmlElementReviewPending,
} from "../lib/htmlElementReview";
import { UiButton } from "@/shared/ui/UiButton";

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

/**
 * The annotation list lives in its own Popover. Each row is only the sequence
 * number, the requirement input and the delete button; the element locator is
 * carried by the bridge and never repeated here.
 */
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

  return (
    <div
      role="dialog"
      aria-label={t("contentViewer.htmlReview.listLabel")}
      style={{
        width: "min(368px, calc(100vw - 32px))",
        maxHeight: "min(70vh, 560px)",
      }}
      className="tw:flex tw:flex-col tw:overflow-hidden tw:rounded-xl tw:bg-bg-elev-1"
    >
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-3 tw:py-2.5">
        <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
          <span className="tw:truncate tw:text-sm tw:font-semibold tw:text-ink-1">
            {t("contentViewer.htmlReview.panelTitle")}
          </span>
          <span
            className="tw:shrink-0 tw:text-xs tw:text-ink-muted"
            aria-live="polite"
          >
            {t("contentViewer.htmlReview.listTotal", {
              count: annotations.length,
            })}
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

      <div className="tw:min-h-0 tw:flex-1 tw:overflow-auto tw:px-3 tw:py-3 tw:space-y-3">
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
          return (
            <div
              key={annotation.id}
              aria-label={t("contentViewer.htmlReview.annotationLabel", {
                number: annotation.number,
              })}
              className="tw:grid tw:grid-cols-[auto_1fr_auto] tw:items-start tw:gap-2"
            >
              <span className="tw:mt-1">
                <NumberBadge number={annotation.number} />
              </span>
              <Input.TextArea
                value={annotation.requirement}
                maxLength={HTML_ELEMENT_REQUIREMENT_MAX}
                disabled={invalid}
                autoSize={{ minRows: 1, maxRows: 3 }}
                placeholder={
                  invalid
                    ? t("contentViewer.htmlReview.invalid")
                    : t("contentViewer.htmlReview.requirementPlaceholder")
                }
                aria-label={t("contentViewer.htmlReview.requirementLabel", {
                  number: annotation.number,
                })}
                onChange={(event) =>
                  onUpdateRequirement(annotation.id, event.target.value)
                }
              />
              <UiButton
                size="mini"
                variant="ghost"
                color="danger"
                aria-label={t("contentViewer.htmlReview.remove")}
                title={t("contentViewer.htmlReview.remove")}
                className="tw:mt-1"
                iconOnly
                onClick={() => onRemove(annotation.id)}
              >
                <MaterialIcon name="delete" />
              </UiButton>
            </div>
          );
        })}
      </div>

      <div className="tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:gap-3 tw:border-t tw:border-line-soft tw:px-2 tw:py-2">
        <span className="tw:text-xs tw:text-ink-muted">
          {t("contentViewer.htmlReview.handoffCount", {
            count: submittableCount,
          })}
        </span>
        <Button
          type="primary"
          size="small"
          disabled={!canHandoff}
          onClick={onHandoff}
        >
          {t("contentViewer.htmlReview.handoff")}
        </Button>
      </div>
    </div>
  );
};

/**
 * The inline editor is anchored next to the selected element inside the
 * iframe's viewport. It starts at the element's top-left corner and moves
 * around the element when that side has no room, so it never covers the
 * element it edits.
 */
export const HtmlElementReviewEditor: React.FC<{
  pending: HtmlElementReviewPending;
  frameRef: React.RefObject<HTMLIFrameElement>;
  onRequirementChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ pending, frameRef, onRequirementChange, onConfirm, onCancel }) => {
  const { t } = useI18n();
  const inputRef = React.useRef<TextAreaRef>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = React.useState<number | null>(null);
  const [frameBox, setFrameBox] = React.useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const target = pending.viewportRect;

  React.useLayoutEffect(() => {
    const frame = frameRef.current;
    const parent = frame?.parentElement;
    if (!frame || !parent) return;
    const measure = () => {
      const frameRect = frame.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const next = {
        left: frameRect.left - parentRect.left,
        top: frameRect.top - parentRect.top,
        width: frameRect.width,
        height: frameRect.height,
      };
      setFrameBox((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(frame);
    observer?.observe(parent);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [frameRef]);

  // The card is sized by its content, so measure it before choosing a spot.
  React.useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 0) {
        setCardHeight((current) => (current === height ? current : height));
      }
    };
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  React.useEffect(() => {
    if (cardHeight === null) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pending.selection.fullXPath, cardHeight]);

  const width = frameBox
    ? Math.min(
        HTML_REVIEW_EDITOR_WIDTH,
        Math.max(160, Math.round(frameBox.width) - 16),
      )
    : HTML_REVIEW_EDITOR_WIDTH;
  const placement =
    frameBox && cardHeight !== null
      ? placeHtmlReviewEditor({
          target,
          bounds: { width: frameBox.width, height: frameBox.height },
          size: { width, height: cardHeight },
        })
      : null;
  const canConfirm = pending.requirement.trim().length > 0;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={t("contentViewer.htmlReview.editorTitle")}
      className="tw:absolute tw:z-20 tw:flex tw:items-center tw:gap-1 tw:rounded-xl tw:border tw:border-line-soft tw:bg-bg-elev-2 tw:px-1 tw:py-1 tw:shadow-elevated"
      style={
        placement && frameBox
          ? {
              left: frameBox.left + placement.left,
              top: frameBox.top + placement.top,
              width,
              boxSizing: "border-box",
            }
          : {
              left: -9999,
              top: -9999,
              width,
              boxSizing: "border-box",
              visibility: "hidden" as const,
            }
      }
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
    >
      <Input.TextArea
        ref={inputRef}
        className="tw:min-h-0 tw:flex-1 tw:self-stretch tw:resize-none"
        rows={1}
        autoSize
        variant="borderless"
        style={{ resize: "none" }}
        value={pending.requirement}
        maxLength={HTML_ELEMENT_REQUIREMENT_MAX}
        placeholder={t("contentViewer.htmlReview.editorPlaceholder")}
        aria-label={t("contentViewer.htmlReview.requirement")}
        onChange={(event) => onRequirementChange(event.target.value)}
      />
      <UiButton
        size="mini"
        variant="ghost"
        className="tw:shrink-0"
        iconOnly
        disabled={!canConfirm}
        aria-label={t("contentViewer.htmlReview.confirm")}
        title={t("contentViewer.htmlReview.confirm")}
        onClick={onConfirm}
      >
        <MaterialIcon name="keyboard_return" />
      </UiButton>
      <UiButton
        size="mini"
        variant="ghost"
        className="tw:shrink-0"
        iconOnly
        aria-label={t("contentViewer.htmlReview.cancel")}
        title={t("contentViewer.htmlReview.cancel")}
        onClick={onCancel}
      >
        <MaterialIcon name="delete" />
      </UiButton>
    </div>
  );
};

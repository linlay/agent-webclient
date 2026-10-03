import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { publicShareBrandIcon, type PublicShareBrand } from "./publicShareBrand";
import { conversationExportMessages } from "@/shared/i18n/conversationExport";
import styles from "./PublicShareAppEntry.module.css";

export type PublicShareAppEntryProps = {
  brand: PublicShareBrand;
  locale: "en-US" | "zh-CN";
};

export const PublicShareAppEntry: React.FC<PublicShareAppEntryProps> = ({ brand, locale }) => {
  const [showEntry, setShowEntry] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const copy = conversationExportMessages[locale].appEntry;

  const closeDialog = useCallback((restoreFocus = true) => {
    setDialogOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => (previousFocusRef.current || triggerRef.current)?.focus(), 0);
    }
  }, []);

  const startAttempt = useCallback(() => {
    if (!brand.downloadPageUrl) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerRef.current;
    setDialogOpen(true);
  }, [brand.downloadPageUrl]);

  useEffect(() => {
    if (!dialogOpen) return;
    const handlePageLeave = (event: Event) => {
      if (event.type === "pagehide" || document.visibilityState === "hidden") {
        closeDialog(false);
      }
    };
    document.addEventListener("visibilitychange", handlePageLeave);
    window.addEventListener("pagehide", handlePageLeave);
    return () => {
      document.removeEventListener("visibilitychange", handlePageLeave);
      window.removeEventListener("pagehide", handlePageLeave);
    };
  }, [dialogOpen, closeDialog]);

  useEffect(() => {
    if (!dialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, dialogOpen]);

  if (!showEntry) return null;

  const title = copy.opening.replace("{productName}", () => brand.productName);
  const description = copy.description;

  return <>
    <div className={styles.entryWrap}>
      <div className={styles.entry}>
        <a ref={triggerRef} className={styles.entryLink} href={brand.openUrl}
          onClick={(event) => {
            if (event.button === 0) startAttempt();
          }}>
          <img src={publicShareBrandIcon(brand.id)} alt="" width={32} height={32}
            onError={(event) => {
              const fallback = publicShareBrandIcon("");
              if (event.currentTarget.getAttribute("src") !== fallback) event.currentTarget.src = fallback;
            }} />
          <span>{copy.continue.replace("{productName}", () => brand.productName)}</span>
          <MaterialIcon name="chevron_right" aria-hidden="true" />
        </a>
        <button className={styles.entryClose} type="button"
          aria-label={copy.dismiss}
          onClick={() => setShowEntry(false)}>
          <MaterialIcon name="close" aria-hidden="true" />
        </button>
      </div>
    </div>
    {dialogOpen && brand.downloadPageUrl && <div className={styles.dialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={descriptionId}>
        <button ref={closeRef} className={styles.dialogClose} type="button"
          aria-label={copy.closeDownload}
          onClick={() => closeDialog()}>
          <MaterialIcon name="close" aria-hidden="true" />
        </button>
        <img className={styles.dialogIcon} src={publicShareBrandIcon(brand.id)} alt="" width={96} height={96}
          onError={(event) => {
            const fallback = publicShareBrandIcon("");
            if (event.currentTarget.getAttribute("src") !== fallback) event.currentTarget.src = fallback;
          }} />
        <div className={styles.dialogCopy}>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <a className={styles.downloadLink} href={brand.downloadPageUrl} target="_blank"
          rel="noopener noreferrer" onClick={() => closeDialog()}>
          {copy.download}
        </a>
      </div>
    </div>}
  </>;
};

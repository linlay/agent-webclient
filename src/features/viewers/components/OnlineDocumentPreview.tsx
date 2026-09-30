import React from "react";
import { Button } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { OnlineDocumentPreviewState } from "../hooks/useOnlineDocumentPreview";
import styles from "./OnlineDocumentPreview.module.css";

export function OnlinePreviewAction({ preview, compact = false, prominent = false }: {
  preview: OnlineDocumentPreviewState; compact?: boolean; prominent?: boolean;
}) {
  const { t } = useI18n();
  return <div className={prominent ? styles.prominentAction : compact ? styles.compactAction : styles.action}>
    <Button disabled={Boolean(preview.reason)} loading={preview.pending} title={preview.reason || undefined}
      size={compact && !prominent ? "small" : undefined}
      className={prominent ? styles.prominentButton : compact ? styles.compactButton : undefined}
      icon={<MaterialIcon name="visibility" />} onClick={() => void preview.prepare()}>
      {t(preview.pending ? "contentViewer.preview.preparing" : "contentViewer.preview.action")}
    </Button>
    {!compact && !prominent && preview.reason ? <span className={styles.hint}>{preview.reason}</span> : null}
    {!compact && !prominent && preview.error ? <span className={styles.error} role="alert">{preview.error}</span> : null}
  </div>;
}

export function OnlinePreviewStatus({ preview }: { preview: OnlineDocumentPreviewState }) {
  const { t } = useI18n();
  if (!preview.error && !preview.reason) return null;
  return <details className={styles.previewNotice}>
    <summary>
      <MaterialIcon name="info" />
      <span>{t("contentViewer.preview.unavailableSummary")}</span>
      <span className={styles.noticeDetails}>{t("contentViewer.preview.details")}</span>
    </summary>
    <p role={preview.error ? "alert" : undefined}>{preview.error || preview.reason}</p>
  </details>;
}

export function OnlineDocumentPreview({ preview, name, onDownload }: {
  preview: OnlineDocumentPreviewState; name: string; onDownload?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [downloading, setDownloading] = React.useState(false);
  const result = preview.result;
  return <section className={styles.surface} aria-label={name}>
    {onDownload ? <div className={styles.toolbar}>
      <Button onClick={preview.dismiss}>{t("contentViewer.preview.back")}</Button>
      <Button disabled={preview.pending || Boolean(preview.reason)} title={preview.reason || undefined} onClick={() => void preview.prepare()}>
        {t(preview.expired ? "contentViewer.preview.renew" : "contentViewer.preview.reload")}
      </Button>
      {result && !preview.expired ? <a href={result.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {t(result.openMode === "external" ? "contentViewer.preview.open" : "contentViewer.preview.openBrowser")}
      </a> : null}
      <Button loading={downloading} onClick={() => {
        setDownloading(true); void onDownload().finally(() => setDownloading(false));
      }}>{t("contentViewer.action.download")}</Button>
    </div> : null}
    {preview.pending ? <p role="status">{t("contentViewer.preview.preparing")}</p>
      : !result ? <OnlinePreviewAction preview={preview} />
      : preview.expired ? <div className={styles.status}>
        <p role="status">{t("contentViewer.preview.expired")}</p>
        {!onDownload ? <Button disabled={Boolean(preview.reason)} title={preview.reason || undefined}
          onClick={() => void preview.prepare()}>{t("contentViewer.preview.renew")}</Button> : null}
      </div>
      : result?.openMode === "iframe" ? <iframe className={styles.frame}
        src={result.url} title={name} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />
      : <div className={styles.status}>
        <p role="status">{t("contentViewer.preview.externalReady")}</p>
        {!onDownload ? <a href={result.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          {t("contentViewer.preview.open")}
        </a> : null}
      </div>}
  </section>;
}

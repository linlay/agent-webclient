import React from "react";
import { Button } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { OnlineDocumentPreviewState } from "../hooks/useOnlineDocumentPreview";
import styles from "./OnlineDocumentPreview.module.css";

export function OnlinePreviewAction({ preview }: { preview: OnlineDocumentPreviewState }) {
  const { t } = useI18n();
  return <div className={styles.action}>
    <Button disabled={Boolean(preview.reason)} loading={preview.pending} title={preview.reason || undefined}
      icon={<MaterialIcon name="visibility" />} onClick={() => void preview.prepare()}>
      {t(preview.pending ? "contentViewer.preview.preparing" : "contentViewer.preview.action")}
    </Button>
    {preview.reason ? <span className={styles.hint}>{preview.reason}</span> : null}
    {preview.error ? <span className={styles.error} role="alert">{preview.error}</span> : null}
  </div>;
}

export function OnlineDocumentPreview({ preview, name, onDownload, onBack }: {
  preview: OnlineDocumentPreviewState; name: string; onDownload: () => Promise<void>; onBack?: () => void;
}) {
  const { t } = useI18n();
  const [downloading, setDownloading] = React.useState(false);
  const result = preview.result;
  return <section className={styles.surface} aria-label={name}>
    <div className={styles.toolbar}>
      <Button onClick={onBack || preview.dismiss}>{t("contentViewer.preview.back")}</Button>
      <Button disabled={preview.pending || Boolean(preview.reason)} title={preview.reason || undefined} onClick={() => void preview.prepare()}>
        {t(preview.expired ? "contentViewer.preview.renew" : "contentViewer.preview.reload")}
      </Button>
      {result && !preview.expired ? <a href={result.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {t(result.openMode === "external" ? "contentViewer.preview.open" : "contentViewer.preview.openBrowser")}
      </a> : null}
      <Button loading={downloading} onClick={() => {
        setDownloading(true); void onDownload().finally(() => setDownloading(false));
      }}>{t("contentViewer.action.download")}</Button>
    </div>
    {preview.pending ? <p role="status">{t("contentViewer.preview.preparing")}</p>
      : !result ? <OnlinePreviewAction preview={preview} />
      : preview.expired ? <p role="status">{t("contentViewer.preview.expired")}</p>
      : result?.openMode === "iframe" ? <iframe className={styles.frame}
        src={result.url} title={name} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />
      : <p role="status">{t("contentViewer.preview.externalReady")}</p>}
  </section>;
}

import React from "react";
import { Button, Tooltip } from "antd";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { useStandaloneViewerActions } from "@/features/viewers/hooks/useStandaloneViewerActions";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./StandaloneDocumentPanel.module.css";

function formatFileSize(sizeBytes: number | undefined, locale: string): string {
  if (sizeBytes === undefined || !Number.isFinite(sizeBytes) || sizeBytes < 0) return "–";
  const units = ["B", "kB", "MB", "GB", "TB", "PB"];
  let value = sizeBytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

interface DocumentMetadataPanelProps {
  name: string;
  mimeType: string;
  sizeBytes?: number;
  note?: string;
  previewAction: React.ReactNode;
  onDownload: () => Promise<void>;
  localActions: React.ReactNode;
  primaryAction?: React.ReactNode;
  previewStatus?: React.ReactNode;
}

export const DocumentMetadataPanel: React.FC<DocumentMetadataPanelProps> = ({
  name, mimeType, sizeBytes, note, previewAction, onDownload, localActions, primaryAction, previewStatus,
}) => {
  const { t, locale } = useI18n();
  const [downloading, setDownloading] = React.useState(false);
  const size = formatFileSize(sizeBytes, locale);
  const compact = Boolean(primaryAction);
  const extension = name.match(/\.([^.]+)$/u)?.[1]?.toUpperCase() || t("contentViewer.metadata.file");
  const fileIcon = /\.pptx?$/iu.test(name) ? "slideshow" : /\.xlsx?$/iu.test(name) ? "table_chart" : "description";
  const download = async () => {
    setDownloading(true);
    try { await onDownload(); }
    finally { setDownloading(false); }
  };

  return (
    <div className={styles.surface}>
      <section className={`${styles.card}${compact ? ` ${styles.compactCard}` : ""}`} aria-label={name}>
        <div className={styles.header}>
          <div className={styles.fileIcon} aria-hidden="true"><MaterialIcon name={fileIcon} /></div>
          <div className={styles.heading}>
            <h2>{name}</h2>
            {compact ? <div className={styles.fileSummary}>
              <Tooltip title={mimeType}><span className={styles.fileType}>{extension}</span></Tooltip>
              <span>{size}</span>
            </div> : null}
          </div>
        </div>
        {!compact ? <dl className={styles.metadata}>
          <dt>{t("contentViewer.metadata.fileSize")}</dt><dd>{size}</dd>
          <dt>MIME</dt><dd className={styles.mime} title={mimeType}>{mimeType}</dd>
        </dl> : null}
        {note ? <p className={styles.note}>{note}</p> : null}
        {compact ? <>
          <div className={styles.primaryAction}>
            {previewAction}
            {primaryAction}
          </div>
          <div className={styles.secondaryActions}>
            <Button className={styles.secondaryButton} size="small" loading={downloading}
              icon={<MaterialIcon name="download" />} onClick={() => void download()}>{t("contentViewer.action.download")}</Button>
            {localActions}
          </div>
          {previewStatus}
        </> : <div className={styles.actions}>
          {previewAction}
          <Button type="primary" loading={downloading} icon={<MaterialIcon name="download" />} onClick={() => void download()}>
            {t("contentViewer.action.download")}
          </Button>
          {localActions}
        </div>}
      </section>
    </div>
  );
};

export const StandaloneDocumentPanel: React.FC<Omit<DocumentMetadataPanelProps, "localActions"> & {
  target: ViewerTarget;
  chatId: string;
  teamChat?: boolean;
}> = ({ target, chatId, teamChat, ...props }) => {
  const { t } = useI18n();
  const localActions = useStandaloneViewerActions(target, chatId, teamChat);
  return <DocumentMetadataPanel {...props} localActions={<>
          <Button disabled={localActions.disabled} loading={localActions.pending === "reveal"}
            title={localActions.hint} icon={<MaterialIcon name="folder_open" />} onClick={() => void localActions.run("reveal")}>
            {localActions.revealLabel}
          </Button>
          <Button disabled={localActions.disabled} loading={localActions.pending === "open-default"}
            title={localActions.hint} icon={<MaterialIcon name="open_in_new" />} onClick={() => void localActions.run("open-default")}>
            {t("contentViewer.localAction.openDefault")}
          </Button>
  </>} />;
};

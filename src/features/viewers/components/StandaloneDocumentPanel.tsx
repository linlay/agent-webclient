import React from "react";
import { Button } from "antd";
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
}

export const DocumentMetadataPanel: React.FC<DocumentMetadataPanelProps> = ({
  name, mimeType, sizeBytes, note, previewAction, onDownload, localActions,
}) => {
  const { t, locale } = useI18n();
  const [downloading, setDownloading] = React.useState(false);
  const size = formatFileSize(sizeBytes, locale);
  const download = async () => {
    setDownloading(true);
    try { await onDownload(); }
    finally { setDownloading(false); }
  };

  return (
    <div className={styles.surface}>
      <section className={styles.card} aria-label={name}>
        <div className={styles.header}>
          <div className={styles.fileIcon} aria-hidden="true"><MaterialIcon name="description" /></div>
          <div className={styles.heading}>
            <h2>{name}</h2>
          </div>
        </div>
        <dl className={styles.metadata}>
          <dt>{t("contentViewer.metadata.fileSize")}</dt><dd>{size}</dd>
          <dt>MIME</dt><dd className={styles.mime} title={mimeType}>{mimeType}</dd>
        </dl>
        {note ? <p className={styles.note}>{note}</p> : null}
        <div className={styles.actions}>
          {previewAction}
          <Button type="primary" loading={downloading} icon={<MaterialIcon name="download" />} onClick={() => void download()}>
            {t("contentViewer.action.download")}
          </Button>
          {localActions}
        </div>
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

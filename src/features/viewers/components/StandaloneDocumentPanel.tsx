import React from "react";
import { Button } from "antd";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { useStandaloneViewerActions } from "@/features/viewers/hooks/useStandaloneViewerActions";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./StandaloneDocumentPanel.module.css";

export const StandaloneDocumentPanel: React.FC<{
  target: ViewerTarget;
  chatId: string;
  teamChat?: boolean;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  note?: string;
  onDownload: () => Promise<void>;
}> = ({ target, chatId, teamChat, name, mimeType, sizeBytes, note, onDownload }) => {
  const { t, locale } = useI18n();
  const localActions = useStandaloneViewerActions(target, chatId, teamChat);
  const [downloading, setDownloading] = React.useState(false);
  const size = sizeBytes === undefined ? "–" : new Intl.NumberFormat(locale).format(sizeBytes);
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
          <dt>{t("contentViewer.metadata.size")}</dt><dd>{size}</dd>
          <dt>MIME</dt><dd className={styles.mime} title={mimeType}>{mimeType}</dd>
        </dl>
        {note ? <p className={styles.note}>{note}</p> : null}
        <div className={styles.actions}>
          <Button disabled icon={<MaterialIcon name="visibility" />}>
            {t("contentViewer.action.previewPlanned")}
          </Button>
          <Button type="primary" loading={downloading} icon={<MaterialIcon name="download" />} onClick={() => void download()}>
            {t("contentViewer.action.download")}
          </Button>
          <Button disabled={localActions.disabled} loading={localActions.pending === "reveal"}
            title={localActions.hint} icon={<MaterialIcon name="folder_open" />} onClick={() => void localActions.run("reveal")}>
            {localActions.revealLabel}
          </Button>
          <Button disabled={localActions.disabled} loading={localActions.pending === "open-default"}
            title={localActions.hint} icon={<MaterialIcon name="open_in_new" />} onClick={() => void localActions.run("open-default")}>
            {t("contentViewer.localAction.openDefault")}
          </Button>
        </div>
      </section>
    </div>
  );
};

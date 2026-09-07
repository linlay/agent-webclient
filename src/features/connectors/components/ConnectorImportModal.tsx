import { useRef, useState } from "react";
import { Modal } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { formatConnectorArchiveSize } from "@/features/connectors/lib/connectorImport";
import type { useConnectorImport } from "@/features/connectors/hooks/useConnectorImport";
import styles from "./ConnectorsConsole.module.css";

export function ConnectorImportModal({ runtime }: { runtime: ReturnType<typeof useConnectorImport> }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  return <Modal
    open={runtime.open}
    title={t("connectors.import.title")}
    width={560}
    destroyOnClose
    maskClosable={!runtime.submitting}
    keyboard={!runtime.submitting}
    closable={!runtime.submitting}
    onCancel={runtime.close}
    onOk={() => void runtime.submit()}
    confirmLoading={runtime.submitting}
    okText={t(runtime.overwriteRequired ? "connectors.import.overwrite.action" : "connectors.import.submit")}
    cancelText={t("connectors.import.cancel")}
    okButtonProps={{ disabled: !runtime.archive, danger: runtime.overwriteRequired }}
    cancelButtonProps={{ disabled: runtime.submitting }}
  >
    <div className={styles.importBody}>
      <input ref={input} className={styles.fileInput} type="file" accept=".zip,application/zip" aria-label={t("connectors.import.select")}
        disabled={runtime.submitting} onChange={event => {
          runtime.acceptFiles(Array.from(event.target.files || []));
          event.currentTarget.value = "";
        }} />
      <button type="button" className={`${styles.dropZone} ${dragActive ? styles.dragActive : ""}`} disabled={runtime.submitting}
        onClick={() => input.current?.click()}
        onDragEnter={event => { event.preventDefault(); if (!runtime.submitting) setDragActive(true); }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => { event.preventDefault(); if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }}
        onDrop={event => { event.preventDefault(); setDragActive(false); runtime.acceptFiles(Array.from(event.dataTransfer.files)); }}>
        <MaterialIcon name="folder_zip" />
        <strong>{runtime.archive?.name || t("connectors.import.drop")}</strong>
        <span className={styles.hint}>{runtime.archive ? formatConnectorArchiveSize(runtime.archive.size) : t("connectors.import.limit")}</span>
      </button>
      <p className={styles.hint}>{t("connectors.import.layout")}</p>
      {runtime.overwriteRequired && <div role="alert" className={styles.importConflict}>
        <strong>{t("connectors.import.overwrite.title")}</strong>
        <p>{t("connectors.import.overwrite.description", { file: runtime.archive?.name || "" })}</p>
      </div>}
      {runtime.error && <div role="alert" className={styles.error}>{runtime.error}</div>}
      {runtime.submitting && <p role="status" className={styles.hint}>{t("connectors.import.uploading")}</p>}
    </div>
  </Modal>;
}

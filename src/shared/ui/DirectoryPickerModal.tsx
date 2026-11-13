import React, { useEffect } from "react";
import { Button, Modal, Spin } from "antd";
import type { HostDirectoryListResponse } from "@/shared/data/api/dto/agents";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import styles from "./DirectoryPickerModal.module.css";

export interface DirectoryPickerModalProps {
  open: boolean;
  title: string;
  hint?: string;
  listing: HostDirectoryListResponse | null;
  loading: boolean;
  error: string;
  canChoose: boolean;
  onBrowse: (path: string) => void;
  onChoose: () => void;
  onCancel: () => void;
}

/**
 * Lists directories on the Agent Platform host; it never shows files.
 * Use with `useDirectoryPicker`, which owns the listing state.
 */
export const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  open,
  title,
  hint,
  listing,
  loading,
  error,
  canChoose,
  onBrowse,
  onChoose,
  onCancel,
}) => {
  const message = useAppMessage();
  // A listing failure is reported as a toast; the stale listing it leaves on
  // screen stays unconfirmable, so the footer explains why.
  useEffect(() => {
    if (error) message.error(error);
  }, [error, message]);
  return (
    <Modal
      className={styles.dialog}
      title={title}
      open={open}
      onCancel={onCancel}
      width="min(560px, calc(100vw - 32px))"
      centered
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t("directoryPicker.cancel")}
        </Button>,
        <Button
          key="choose"
          type="primary"
          disabled={!canChoose}
          title={!canChoose && error ? error : undefined}
          onClick={onChoose}
        >
          {t("directoryPicker.choose")}
        </Button>,
      ]}
      destroyOnHidden
    >
      <div className={styles.content}>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        <div className={styles.toolbar}>
          <Button
            icon={<MaterialIcon name="arrow_upward" />}
            disabled={loading || !listing?.parent}
            onClick={() => listing?.parent && onBrowse(listing.parent)}
            aria-label={t("directoryPicker.up")}
            title={t("directoryPicker.up")}
          />
          <span className={styles.path} title={listing?.path}>
            {listing?.path ?? ""}
          </span>
        </div>
        <Spin spinning={loading}>
          <div className={styles.list}>
            {listing && listing.entries.length === 0 ? (
              <div className={styles.empty}>{t("directoryPicker.empty")}</div>
            ) : null}
            {listing?.entries.map((entry) => (
              <Button
                key={entry.path}
                type="text"
                block
                className={styles.row}
                disabled={loading}
                onClick={() => onBrowse(entry.path)}
              >
                <MaterialIcon name="folder_open" className={styles.folder} />
                <span className={styles.name} title={entry.name}>
                  {entry.name}
                </span>
                <MaterialIcon
                  name="chevron_right"
                  className={styles.chevron}
                />
              </Button>
            ))}
            {listing?.truncated ? (
              <div className={styles.hint}>{t("directoryPicker.truncated")}</div>
            ) : null}
          </div>
        </Spin>
      </div>
    </Modal>
  );
};

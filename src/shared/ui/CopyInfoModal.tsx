import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Collapse, Modal, Spin, Tooltip, message } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";
import {
  buildCopyAllText,
  type CopyInfoGroup,
  type CopyInfoRow,
} from "@/shared/ui/copyInfoModel";

type CopyFeedback = "copied" | "error";

export const CopyInfoModal: React.FC<{
  open: boolean;
  title: React.ReactNode;
  groups: CopyInfoGroup[];
  rawData: unknown | null;
  rawReady: boolean;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onClose: () => void;
}> = ({
  open,
  title,
  groups,
  rawData,
  rawReady,
  loading = false,
  error = "",
  onRetry,
  onClose,
}) => {
  const { t } = useI18n();
  const [copyFeedback, setCopyFeedback] = useState<Record<string, CopyFeedback>>({});
  const timersRef = useRef<Map<string, number>>(new Map());

  const clearFeedback = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    setCopyFeedback({});
  };

  useEffect(() => {
    if (!open) clearFeedback();
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [open]);

  const visibleGroups = useMemo(
    () => groups.filter((group) => group.rows.length > 0),
    [groups],
  );
  const copyAllText = useMemo(
    () => buildCopyAllText(visibleGroups),
    [visibleGroups],
  );

  const flashFeedback = (key: string, status: CopyFeedback) => {
    const currentTimer = timersRef.current.get(key);
    if (currentTimer) window.clearTimeout(currentTimer);
    setCopyFeedback((current) => ({ ...current, [key]: status }));
    const timer = window.setTimeout(() => {
      setCopyFeedback((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      timersRef.current.delete(key);
    }, 1600);
    timersRef.current.set(key, timer);
  };

  const handleCopy = (key: string, label: string, value: string) => {
    if (!value) return;
    void copyText(value)
      .then(() => {
        flashFeedback(key, "copied");
        message.success(t("copyInfo.feedback.copied", { label }));
      })
      .catch(() => {
        flashFeedback(key, "error");
        message.error(t("copyInfo.feedback.failed", { label }));
      });
  };

  const renderRow = (groupKey: string, row: CopyInfoRow) => {
    const feedbackKey = `${groupKey}:${row.key}`;
    const feedback = copyFeedback[feedbackKey];
    const copyTitle = feedback === "copied"
      ? t("copyInfo.feedback.copiedShort")
      : feedback === "error"
        ? t("copyInfo.feedback.failedShort")
        : t("copyInfo.action.copyField", { label: row.label });

    return (
      <div className="copy-info-row" key={row.key}>
        <div className="copy-info-row-label">{row.label}</div>
        <pre className={`copy-info-row-value${row.code ? " is-code" : ""}`}>
          {row.displayValue}
        </pre>
        <Tooltip title={copyTitle}>
          <Button
            type="text"
            size="small"
            className="copy-info-row-action ui-icon-hover-24"
            aria-label={t("copyInfo.action.copyField", { label: row.label })}
            danger={feedback === "error"}
            icon={(
              <MaterialIcon
                name={feedback === "copied" ? "check" : "content_copy"}
              />
            )}
            onClick={() => handleCopy(feedbackKey, row.label, row.copyValue)}
          />
        </Tooltip>
      </div>
    );
  };

  const renderGroupRows = (group: CopyInfoGroup) => (
    <div className="copy-info-group-rows">
      {group.rows.map((row) => renderRow(group.key, row))}
    </div>
  );

  const rawJson = rawReady && rawData !== null
    ? (() => {
        try {
          return JSON.stringify(rawData, null, 2);
        } catch {
          return "";
        }
      })()
    : "";

  return (
    <Modal
      open={open}
      title={title}
      width="min(760px, calc(100vw - 32px))"
      className="copy-info-modal"
      destroyOnHidden
      onCancel={onClose}
      footer={[
        <Button
          key="copy-all"
          icon={<MaterialIcon name="content_copy" />}
          disabled={!copyAllText}
          onClick={() => handleCopy("copy-all", t("copyInfo.action.copyAll"), copyAllText)}
        >
          {t("copyInfo.action.copyAll")}
        </Button>,
        <Button
          key="copy-json"
          icon={<MaterialIcon name="description" />}
          disabled={!rawReady || !rawJson}
          onClick={() => handleCopy("copy-json", t("copyInfo.action.copyJson"), rawJson)}
        >
          {t("copyInfo.action.copyJson")}
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          {t("copyInfo.action.close")}
        </Button>,
      ]}
    >
      {error ? (
        <Alert
          className="copy-info-alert"
          type="error"
          showIcon
          message={t("copyInfo.load.failed")}
          description={error}
          action={onRetry ? (
            <Button size="small" onClick={onRetry}>
              {t("copyInfo.action.retry")}
            </Button>
          ) : undefined}
        />
      ) : null}
      {loading ? (
        <div className="copy-info-loading" role="status">
          <Spin size="small" />
          <span>{t("copyInfo.load.loading")}</span>
        </div>
      ) : null}
      <div className="copy-info-content">
        {visibleGroups.map((group) => group.collapsed ? (
          <Collapse
            key={group.key}
            ghost
            size="small"
            className="copy-info-advanced"
            items={[{
              key: group.key,
              label: group.label,
              children: renderGroupRows(group),
            }]}
          />
        ) : (
          <section className="copy-info-group" key={group.key}>
            <h3>{group.label}</h3>
            {renderGroupRows(group)}
          </section>
        ))}
      </div>
    </Modal>
  );
};

import React from "react";
import { Modal, Tabs } from "antd";
import type { AdminAgentDetailResponse } from "@/shared/data";
import { useAgentImport } from "@/features/agents/hooks/useAgentImport";
import { formatAgentArchiveSize } from "@/features/agents/lib/agentImport";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

export interface AgentCreateModalProps {
  open: boolean;
  t: (key: string, vars?: Record<string, unknown>) => string;
  onCancel: () => void;
  onDirectCreate: () => Promise<boolean> | boolean;
  onBeforeZipImport: () => boolean;
  onZipImport: (file: File, overwrite: boolean) => Promise<AdminAgentDetailResponse>;
  onImported: (detail: AdminAgentDetailResponse) => Promise<void> | void;
}

export const AgentCreateModal: React.FC<AgentCreateModalProps> = (props) => {
  const runtime = useAgentImport(props);
  const { t } = props;
  const zipContent = (
    <div className="tw:flex tw:flex-col tw:gap-4 tw:pt-1">
      <input
        ref={runtime.fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="tw:hidden"
        aria-label={t("agentConsole.import.select")}
        onChange={(event) => {
          runtime.acceptArchive(event.target.files?.[0] || null);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className={`tw:flex tw:min-h-36 tw:w-full tw:cursor-pointer tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-control tw:border tw:border-dashed tw:p-5 tw:text-center tw:transition-colors ${runtime.dragActive ? "tw:border-accent tw:bg-accent-soft" : "tw:border-line-soft tw:bg-bg-subtle"}`}
        onClick={() => runtime.fileInputRef.current?.click()}
        disabled={runtime.submitting}
        onDragEnter={(event) => { event.preventDefault(); runtime.setDragActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { event.preventDefault(); runtime.setDragActive(false); }}
        onDrop={(event) => {
          event.preventDefault();
          runtime.setDragActive(false);
          runtime.acceptArchive(event.dataTransfer.files?.[0] || null);
        }}
      >
        <MaterialIcon name="folder_zip" />
        {runtime.zipFile ? (
          <>
            <strong className="tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-sm tw:text-ink-1">{runtime.zipFile.name}</strong>
            <span className="tw:text-xs tw:text-ink-muted">{formatAgentArchiveSize(runtime.zipFile.size)}</span>
          </>
        ) : (
          <>
            <span className="tw:text-sm tw:text-ink-1">{t("agentConsole.import.drop")}</span>
            <span className="tw:flex tw:max-w-lg tw:flex-col tw:text-xs tw:leading-5 tw:text-ink-muted">
              {t("agentConsole.import.description").split("；").map((line, index) => <span key={index}>{line}</span>)}
            </span>
          </>
        )}
      </button>
      <div className="tw:text-xs tw:leading-5 tw:text-warning">{t("agentConsole.import.trustWarning")}</div>
      {runtime.submitting ? <div role="status" aria-live="polite" className="tw:text-xs tw:text-ink-muted">{t("agentConsole.import.uploading")}</div> : null}
    </div>
  );

  return (
    <Modal
      open={props.open}
      title={t("agentConsole.create.title")}
      width={560}
      destroyOnClose
      maskClosable={!runtime.submitting}
      keyboard={!runtime.submitting}
      okText={t(runtime.mode === "direct" ? "agentConsole.create.direct.submit" : "agentConsole.import.submit")}
      cancelText={t("agentConsole.import.cancel")}
      confirmLoading={runtime.submitting}
      okButtonProps={{ disabled: runtime.mode === "zip" && !runtime.zipFile }}
      onCancel={() => { if (!runtime.submitting) props.onCancel(); }}
      onOk={() => void runtime.submit()}
    >
      <Tabs
        activeKey={runtime.mode}
        onChange={(key) => { runtime.setMode(key as "zip" | "direct"); runtime.setDiagnostics([]); }}
        items={[
          { key: "zip", label: t("agentConsole.create.mode.zip"), children: zipContent },
          {
            key: "direct",
            label: t("agentConsole.create.mode.direct"),
            children: (
              <div className="tw:flex tw:min-h-36 tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:rounded-control tw:border tw:border-line-soft tw:bg-bg-subtle tw:p-6 tw:text-center">
                <MaterialIcon name="add" />
                <div className="tw:text-sm tw:font-medium tw:text-ink-1">{t("agentConsole.create.direct.title")}</div>
                <div className="tw:max-w-md tw:text-xs tw:leading-5 tw:text-ink-muted">{t("agentConsole.create.direct.description")}</div>
              </div>
            ),
          },
        ]}
      />
      {runtime.diagnostics.length ? (
        <ul className="tw:mt-3 tw:flex tw:list-disc tw:flex-col tw:gap-1 tw:pl-5 tw:text-xs tw:text-danger">
          {runtime.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code || "diagnostic"}-${diagnostic.sourcePath || index}`}>
              {diagnostic.sourcePath ? `${diagnostic.sourcePath}: ` : ""}{diagnostic.message}
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
};

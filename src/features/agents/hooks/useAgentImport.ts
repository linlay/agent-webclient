import { useEffect, useRef, useState } from "react";
import { message, Modal } from "antd";
import type {
  AdminAgentDetailResponse,
  AdminAgentDiagnostic,
} from "@/shared/data";
import {
  agentImportDiagnostics,
  importAgentArchiveWithOverwrite,
  validateAgentArchiveFile,
  type AgentImportConflict,
} from "@/features/agents/lib/agentImport";

export type AgentCreateMode = "zip" | "direct";

interface UseAgentImportOptions {
  open: boolean;
  t: (key: string, vars?: Record<string, unknown>) => string;
  onDirectCreate: () => Promise<boolean> | boolean;
  onBeforeZipImport: () => boolean;
  onZipImport: (file: File, overwrite: boolean) => Promise<AdminAgentDetailResponse>;
  onImported: (detail: AdminAgentDetailResponse) => Promise<void> | void;
}

function confirmAgentImportOverwrite(
  conflict: AgentImportConflict,
  t: UseAgentImportOptions["t"],
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    Modal.confirm({
      title: t("agentConsole.import.overwrite.title"),
      content: t("agentConsole.import.overwrite.description", {
        name: conflict.existingName || conflict.agentKey,
        key: conflict.agentKey,
      }),
      okText: t("agentConsole.import.overwrite.confirm"),
      cancelText: t("agentConsole.import.overwrite.cancel"),
      okButtonProps: { danger: true },
      onOk: () => finish(true),
      onCancel: () => finish(false),
      afterClose: () => finish(false),
    });
  });
}

export function useAgentImport(options: UseAgentImportOptions) {
  const [mode, setMode] = useState<AgentCreateMode>("zip");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AdminAgentDiagnostic[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!options.open) return;
    setMode("zip");
    setZipFile(null);
    setDragActive(false);
    setSubmitting(false);
    setDiagnostics([]);
  }, [options.open]);

  const acceptArchive = (file: File | null) => {
    setDiagnostics([]);
    const validation = validateAgentArchiveFile(file);
    if (validation) {
      setZipFile(null);
      void message.error(options.t(`agentConsole.import.error.${validation}`));
      return;
    }
    setZipFile(file as File);
  };

  const submit = async () => {
    if (submitting) return;
    if (mode === "direct") {
      setSubmitting(true);
      try {
        await options.onDirectCreate();
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!zipFile || !options.onBeforeZipImport()) return;
    setDiagnostics([]);
    setSubmitting(true);
    try {
      const imported = await importAgentArchiveWithOverwrite(
        zipFile,
        options.onZipImport,
        (conflict) => confirmAgentImportOverwrite(conflict, options.t),
      );
      if (imported) await options.onImported(imported);
    } catch (error) {
      setDiagnostics(agentImportDiagnostics(error));
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    mode,
    zipFile,
    dragActive,
    submitting,
    diagnostics,
    fileInputRef,
    setMode,
    setDragActive,
    setDiagnostics,
    acceptArchive,
    submit,
  };
}

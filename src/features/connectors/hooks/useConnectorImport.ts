import { connectorErrorDetails } from "../lib/connectorError";
import { useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { connectorImportErrorKey, isConnectorImportConflict, validateConnectorArchive, validateConnectorMCPURL } from "@/features/connectors/lib/connectorImport";
import type { ImportConnectorMCPRequest } from "@/shared/data";

interface Options {
  onImport: (file: File, overwrite: boolean) => Promise<string | null>;
  onImportMCP: (params: ImportConnectorMCPRequest) => Promise<string | null>;
  onImported: (id: string) => void;
}

export function useConnectorImport({ onImport, onImportMCP, onImported }: Options) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"archive" | "mcp">("archive");
  const [mcpUrl, setMCPURL] = useState("");
  const [authMode, setAuthMode] = useState<"mcp" | "none">("mcp");
  const [archive, setArchive] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [overwriteRequired, setOverwriteRequired] = useState(false);
  const [error, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const setError = (message: string) => { setErrorMessage(message); setErrorDetails(""); };
  const submittingRef = useRef(false);

  const acceptFiles = (files: File[]) => {
    if (submittingRef.current || files.length === 0) return;
    const validation = files.length > 1 ? "multiple" : validateConnectorArchive(files[0]);
    setOverwriteRequired(false);
    setError(validation ? t(`connectors.import.error.${validation}`) : "");
    setArchive(validation ? null : files[0]);
  };

  const submit = async () => {
    if (submittingRef.current || (mode === "archive" ? !archive : !mcpUrl.trim())) return;
    if (mode === "mcp" && !validateConnectorMCPURL(mcpUrl)) {
      setError(t("connectors.import.mcp.invalidUrl"));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const id = mode === "archive" ? await onImport(archive!, overwriteRequired) : await onImportMCP({ mcpUrl: mcpUrl.trim(), authMode });
      if (!id) return;
      setOpen(false);
      setMCPURL("");
      setArchive(null);
      setOverwriteRequired(false);
      onImported(id);
    } catch (cause) {
      const conflict = mode === "archive" && isConnectorImportConflict(cause);
      setOverwriteRequired(conflict);
      const errorKey = mode === "mcp" && (cause as { status?: number } | null)?.status === 413
        ? "connectors.import.mcp.serverSize" : connectorImportErrorKey(cause);
      if (!conflict) {
        setError(mode === "mcp" && isConnectorImportConflict(cause) ? t("connectors.import.mcp.exists")
          : errorKey ? t(errorKey) : cause instanceof Error ? cause.message : String(cause));
        setErrorDetails(connectorErrorDetails(cause));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return {
    open, archive, submitting, mode, mcpUrl, authMode,
    canSubmit: mode === "archive" ? !!archive : !!mcpUrl.trim(),
    setMode: (value: "archive" | "mcp") => { if (!submittingRef.current) { setMode(value); setOverwriteRequired(false); setError(""); } },
    setMCPURL: (value: string) => { if (!submittingRef.current) { setMCPURL(value); setError(""); } },
    setAuthMode: (value: "mcp" | "none") => { if (!submittingRef.current) { setAuthMode(value); setError(""); } },
    overwriteRequired, error, errorDetails, acceptFiles, submit,
    show: () => {
      if (submittingRef.current) return;
      setArchive(null);
      setMode("archive");
      setMCPURL("");
      setAuthMode("mcp");
      setError("");
      setOverwriteRequired(false);
      setOpen(true);
    },
    close: () => { if (!submittingRef.current) { setOpen(false); setMCPURL(""); } },
  };
}

import { connectorErrorDetails } from "../lib/connectorError";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { CONNECTOR_MCP_ICON_MAX_BYTES, connectorUrlToId, validConnectorImportId, readConnectorImportIcon, connectorImportErrorKey, isConnectorImportConflict, validateConnectorArchive, validateConnectorMCPURL } from "@/features/connectors/lib/connectorImport";
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
  const [mcpName, setMCPName] = useState("");
  const [mcpId, setMCPId] = useState("");
  const [description, setDescription] = useState("");
  const [iconPng, setIconPng] = useState("");
  const [iconPreset, setIconPreset] = useState<ImportConnectorMCPRequest["iconPreset"]>();
  const [iconName, setIconName] = useState("");
  const [iconReading, setIconReading] = useState(false);
  const iconRevision = useRef(0);
  const iconPending = useRef(false);
  const idEdited = useRef(false);
  useEffect(() => () => { iconRevision.current += 1; }, []);
  const [authMode, setAuthMode] = useState<NonNullable<ImportConnectorMCPRequest["authMode"]>>("mcp");
  const [tokenAuth, setTokenAuth] = useState<NonNullable<ImportConnectorMCPRequest["tokenAuth"]>>("bearer");
  const [headerName, setHeaderName] = useState("X-API-Key");
  const [archive, setArchive] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [overwriteRequired, setOverwriteRequired] = useState(false);
  const [error, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const setError = (message: string) => { setErrorMessage(message); setErrorDetails(""); };
  const submittingRef = useRef(false);

  const clearMetadata = () => {
    idEdited.current = false;
    iconRevision.current += 1; iconPending.current = false;
    setMCPName(""); setMCPId(""); setDescription(""); setIconPng(""); setIconName(""); setIconPreset(undefined); setIconReading(false);
  };
  const acceptIcon = async (file: File | null) => {
    if (submittingRef.current) return;
    const revision = ++iconRevision.current;
    iconPending.current = false; setIconReading(false); setError("");
    if (!file) { setIconPng(""); setIconName(""); return; }
    if (!file.name.toLowerCase().endsWith(".png") || file.size === 0 || file.size > CONNECTOR_MCP_ICON_MAX_BYTES) {
      setError(t("connectors.import.mcp.invalidIcon")); return;
    }
    iconPending.current = true; setIconReading(true);
    try {
      const data = await readConnectorImportIcon(file);
      if (revision !== iconRevision.current) return;
      setIconPng(data); setIconName(file.name); setIconPreset(undefined);
    } catch (cause) {
      if (revision === iconRevision.current) setError(t(cause instanceof Error ? cause.message : "connectors.import.mcp.iconReadFailed"));
    } finally { if (revision === iconRevision.current) { iconPending.current = false; setIconReading(false); } }
  };
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
    if (mode === "mcp" && (iconPending.current || !mcpName.trim() || !validConnectorImportId(mcpId.trim()))) {
      if (!iconPending.current) setError(t(!mcpName.trim() ? "connectors.import.mcp.nameRequired" : "connectors.import.mcp.invalidId"));
      return;
    }
    if (mode === "mcp" && authMode === "token" && tokenAuth === "header" && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(headerName.trim())) {
      setError(t("connectors.import.mcp.invalidHeader"));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const id = mode === "archive" ? await onImport(archive!, overwriteRequired) : await onImportMCP({ mcpUrl: mcpUrl.trim(), name: mcpName.trim(), id: mcpId.trim(), ...(description.trim() ? { description: description.trim() } : {}), ...(iconPng ? { iconPng } : iconPreset ? { iconPreset } : {}), authMode, ...(authMode === "token" ? { tokenAuth, ...(tokenAuth === "header" ? { headerName: headerName.trim() } : {}) } : {}) });
      if (!id) return;
      setOpen(false);
      setMCPURL("");
      clearMetadata();
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
    open, archive, submitting, mode, mcpUrl, mcpName, mcpId, description, iconPng, iconName, iconPreset, iconReading, acceptIcon, authMode, tokenAuth, headerName,
    canSubmit: mode === "archive" ? !!archive : !!mcpUrl.trim() && !!mcpName.trim() && validConnectorImportId(mcpId.trim()) && !iconReading,
    setMode: (value: "archive" | "mcp") => { if (!submittingRef.current) { setMode(value); setOverwriteRequired(false); setError(""); } },
    setMCPURL: (value: string) => { if (!submittingRef.current) { setMCPURL(value); if (!idEdited.current) setMCPId(connectorUrlToId(value)); setError(""); } },
    setMCPName: (value: string) => { if (!submittingRef.current) { setMCPName(value); setError(""); } },
    setIconPreset: (value: ImportConnectorMCPRequest["iconPreset"]) => {
      if (submittingRef.current) return;
      iconRevision.current += 1; iconPending.current = false; setIconReading(false); setIconPreset(value); setIconPng(""); setIconName(""); setError("");
    },
    setMCPId: (value: string) => { if (!submittingRef.current) { idEdited.current = true; setMCPId(value); setError(""); } },
    setDescription: (value: string) => { if (!submittingRef.current) { setDescription(value); setError(""); } },
    setAuthMode: (value: NonNullable<ImportConnectorMCPRequest["authMode"]>) => { if (!submittingRef.current) { setAuthMode(value); setError(""); } },
    setTokenAuth: (value: NonNullable<ImportConnectorMCPRequest["tokenAuth"]>) => { if (!submittingRef.current) { setTokenAuth(value); setError(""); } },
    setHeaderName: (value: string) => { if (!submittingRef.current) { setHeaderName(value); setError(""); } },
    overwriteRequired, error, errorDetails, acceptFiles, submit,
    show: () => {
      if (submittingRef.current) return;
      setArchive(null);
      setMode("archive");
      setMCPURL("");
      clearMetadata();
      setAuthMode("mcp");
      setTokenAuth("bearer");
      setHeaderName("X-API-Key");
      setError("");
      setOverwriteRequired(false);
      setOpen(true);
    },
    close: () => { if (!submittingRef.current) { setOpen(false); setMCPURL(""); clearMetadata(); } },
  };
}

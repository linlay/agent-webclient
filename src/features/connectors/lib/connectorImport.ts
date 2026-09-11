// Mirrors connector.MaxArchiveUploadBytes; the backend validates package contents.
export const CONNECTOR_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;

export type ConnectorArchiveValidation = "" | "type" | "empty" | "size" | "multiple";

export function validateConnectorArchive(file: Pick<File, "name" | "size"> | null): ConnectorArchiveValidation {
  if (!file || !file.name.toLowerCase().endsWith(".zip")) return "type";
  if (file.size <= 0) return "empty";
  return file.size > CONNECTOR_ARCHIVE_MAX_BYTES ? "size" : "";
}

export function formatConnectorArchiveSize(size: number): string {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KiB` : `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

export function isConnectorImportConflict(error: unknown): boolean {
  const value = error as { status?: number; code?: string } | null;
  return value?.status === 409 && value.code === "connector_exists";
}

export function connectorImportErrorKey(error: unknown): string {
  const value = error as { status?: number; code?: string } | null;
  if (value?.status === 413) return "connectors.import.error.serverSize";
  if (value?.status === 403 && value.code === "builtin_connector_readonly") return "connectors.import.error.builtin";
  return "";
}

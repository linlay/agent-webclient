export interface ViewReference {
  source: "builtin" | "connector";
  connectorId?: string;
  key: string;
  version?: string;
  hash?: string;
  renderer?: "native" | "html" | "qlc";
}
export interface ViewRequest {
  chatId?: string;
  runId?: string;
  source: "builtin" | "connector";
  connectorId?: string;
  key: string;
  hash?: string;
  usage?: "display" | "form";
}
export interface ViewDocument {
  view: ViewReference;
  entry?: string;
  html?: string;
  qlc?: Record<string, unknown>;
  assets?: Array<{ path: string; mediaType: string; data: string }>;
}
export function readViewReference(value: unknown): ViewReference | undefined {
  if (!value || typeof value !== "object") return undefined;
  const ref = value as Record<string, unknown>;
  if (typeof ref.key !== "string" || (ref.source !== "builtin" && ref.source !== "connector")) return undefined;
  const valid = /^[a-z0-9][a-z0-9._-]*$/;
  if (!valid.test(ref.key)) return undefined;
  if (ref.source === "connector" && (typeof ref.connectorId !== "string" || !valid.test(ref.connectorId))) return undefined;
  if (ref.source === "builtin" && (ref.connectorId !== undefined || ref.hash !== undefined || ref.version !== undefined)) return undefined;
  if (ref.hash !== undefined && (typeof ref.hash !== "string" || !/^[a-f0-9]{64}$/.test(ref.hash))) return undefined;
  return { source: ref.source, ...(ref.source === "connector" ? { source: "connector", connectorId: ref.connectorId as string} : {}), key: ref.key,
    ...(typeof ref.hash === "string" ? { hash: ref.hash } : {}),
    ...(typeof ref.version === "string" ? { version: ref.version } : {}),
    ...(ref.renderer === "native" || ref.renderer === "html" || ref.renderer === "qlc" ? { renderer: ref.renderer } : {}),
  };
}

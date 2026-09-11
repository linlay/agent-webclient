export interface ViewReference {
  connectorId: string;
  key: string;
  version?: string;
  hash?: string;
  renderer?: "html" | "qlc";
}
export interface ViewRequest {
  chatId: string;
  connectorId: string;
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
  if (typeof ref.connectorId !== "string" || typeof ref.key !== "string") return undefined;
  const valid = /^[a-z0-9][a-z0-9._-]*$/;
  if (!valid.test(ref.connectorId) || !valid.test(ref.key)) return undefined;
  if (ref.hash !== undefined && (typeof ref.hash !== "string" || !/^[a-f0-9]{64}$/.test(ref.hash))) return undefined;
  return { connectorId: ref.connectorId, key: ref.key,
    ...(typeof ref.hash === "string" ? { hash: ref.hash } : {}),
    ...(typeof ref.version === "string" ? { version: ref.version } : {}),
    ...(ref.renderer === "html" || ref.renderer === "qlc" ? { renderer: ref.renderer } : {}),
  };
}

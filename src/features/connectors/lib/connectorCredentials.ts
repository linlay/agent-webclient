import type { ConnectorSummary, ConnectorTokenSchema } from "@/shared/data";
import { safeConnectorAuthorizationUrl } from "./connectorAuth";

// Only IDs and a recheck reason survive a dialog close; never credential values
// or server sessions. Reopening an interrupted write cannot blindly resend it.
const requiredChecks = new Map<string, "unknown" | "pending">();
export function credentialStateCheckRequired(id: string) { return requiredChecks.get(id); }
export function requireCredentialStateCheck(id: string, reason: "unknown" | "pending" = "unknown") { requiredChecks.set(id, reason); }
export function confirmCredentialState(id: string) { requiredChecks.delete(id); }

/** Only manifest-declared fields enter a request. Never read credential values. */
export function connectorTokenSchema(item: ConnectorSummary): ConnectorTokenSchema | null {
  if (item.auth_mode !== "token" || !item.token_schema || typeof item.token_schema !== "object") return null;
  const raw = item.token_schema as Record<string, unknown>;
  if (!Array.isArray(raw.fields) || !raw.fields.length || raw.fields.length > 64) return null;
  const fields: ConnectorTokenSchema["fields"] = [];
  const seen = new Set<string>();
  for (const value of raw.fields) {
    if (!value || typeof value !== "object") return null;
    const field = value as Record<string, unknown>;
    // Platform accepts these legacy manifest defaults; do not infer new fields.
    const key = field.key ?? field.name;
    const type = field.type || "password";
    if (typeof key !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(key) || seen.has(key)
      || (field.name !== undefined && field.name !== key) || !["text", "password"].includes(type as string)
      || typeof field.label !== "string" || !field.label.trim() || typeof field.required !== "boolean"
      || (type === "password" && field.defaultValue !== undefined && field.defaultValue !== "")) return null;
    seen.add(key);
    fields.push({ key, label: field.label, type: type as "text" | "password", required: field.required,
      ...(typeof field.placeholder === "string" ? { placeholder: field.placeholder } : {}),
      ...(typeof field.description === "string" ? { description: field.description } : {}),
      ...(type === "text" && typeof field.defaultValue === "string" ? { defaultValue: field.defaultValue } : {}),
    });
  }
  const docUrl = typeof raw.docUrl === "string" ? safeConnectorAuthorizationUrl(raw.docUrl) : null;
  return { fields, ...(typeof raw.title === "string" ? { title: raw.title } : {}),
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    ...(docUrl ? { docUrl } : {}), ...(typeof raw.docLabel === "string" ? { docLabel: raw.docLabel } : {}) };
}

export function initialConnectorCredentials(schema: ConnectorTokenSchema): Record<string, string> {
  return Object.fromEntries(schema.fields.map(field => [field.key, field.type === "text" ? field.defaultValue || "" : ""]));
}

export function validatedConnectorCredentials(schema: ConnectorTokenSchema, values: Record<string, string>): Record<string, string> | null {
  const declared: Record<string, string> = {};
  for (const field of schema.fields) {
    const value = values[field.key] || "";
    if ((field.required && !value.trim()) || value.length > 65_536 || /[\0\r\n]/.test(value)) return null;
    declared[field.key] = value;
  }
  return new Blob([JSON.stringify(declared)]).size <= 65_536 ? declared : null;
}

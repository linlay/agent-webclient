import { getBackendMode } from "@/shared/config/backendMode";
import { getGatewaySession } from "./gatewaySession";

// An opaque credential identifies standalone sessions without persisting the credential.
function credentialFingerprint(value: string): string {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < value.length; i += 1) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ value.charCodeAt(i);
  }
  return `${a >>> 0}:${b >>> 0}`;
}

export function resolveStorageIdentity(accessToken: string): string {
  const mode = getBackendMode();
  const context = typeof window === "undefined" ? "" : window.__AGENT_APP_AUTH_CONTEXT || "";
  const identity = mode === "gateway"
    ? `user:${getGatewaySession()?.user?.subject || "anonymous"}`
    : context ? `desktop:${context}` : `credential:${credentialFingerprint(accessToken || "")}`;
  return JSON.stringify([mode, identity]);
}


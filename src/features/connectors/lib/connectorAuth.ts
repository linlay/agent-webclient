import type { ConnectorAuthActionResult, ConnectorAuthSession, ConnectorAuthStatus, ConnectorSummary } from "@/shared/data";

export type ConnectorAuthViewStatus = ConnectorAuthStatus | "unknown" | "expired";

export function supportsConnectorLogin(mode: ConnectorSummary["auth_mode"]): boolean {
  return mode === "cli" || mode === "oauth" || mode === "mcp";
}

export function isConnectorAuthActive(session: ConnectorAuthSession | null): boolean {
  return session?.status === "preparing" || session?.status === "pending";
}

export function connectorAuthDeadline(session: ConnectorAuthSession | null): number | null {
  const time = Date.parse(session?.expiresAt || "");
  // The backend returns Go's zero time when there is no active session.
  return Number.isFinite(time) && time > 0 ? time : null;
}

export function connectorAuthViewStatus(session: ConnectorAuthSession | null, now = Date.now()): ConnectorAuthViewStatus {
  if (!session) return "unknown";
  const deadline = connectorAuthDeadline(session);
  if (deadline !== null && deadline <= now && (isConnectorAuthActive(session) || session.status === "canceled" || session.status === "failed")) return "expired";
  return session.status;
}

export function safeConnectorAuthorizationUrl(value?: string): string | null {
  if (!value || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const statuses: ConnectorAuthStatus[] = ["not_required", "setup_required", "unauthorized", "preparing", "pending", "authorized", "failed", "canceled"];

export function readConnectorAuthSession(value: ConnectorAuthSession, id: string): ConnectorAuthSession {
  if (!value || value.connectorId !== id || !statuses.includes(value.status) || typeof value.sessionId !== "string" || typeof value.expiresAt !== "string"
    || (value.authorizationUrl !== undefined && typeof value.authorizationUrl !== "string") || (value.message !== undefined && typeof value.message !== "string")) {
    throw new Error("connectors.auth.error.response");
  }
  return value;
}

export function readConnectorAuthAction(value: ConnectorAuthActionResult, id: string, status: ConnectorAuthActionResult["status"]): ConnectorAuthSession {
  if (!value || value.id !== id || value.status !== status) throw new Error("connectors.auth.error.response");
  return { connectorId: id, sessionId: "", status, expiresAt: "" };
}

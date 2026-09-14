import { normalizePlatformError } from "@/shared/data/errors/platformError";

// Show only the server reason and identifiers, never the complete response/config.
export function connectorErrorDetails(cause: unknown): string {
  const error = normalizePlatformError(cause);
  const reason = error.message
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/((?:["']?)(?:access[_-]?token|refresh[_-]?token|token|secret|password|api[_-]?key|authorization|cookie)(?:["']?)\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi, "$1[redacted]");
  return [error.code, error.status == null ? "" : String(error.status), reason].filter(Boolean).join(" · ").slice(0, 4000);
}

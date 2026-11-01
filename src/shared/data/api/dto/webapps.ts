export interface WebappHost {
  stage: string; staticAvailable: boolean; hostingAvailable: boolean;
  backendPrerequisitesReady: boolean; nodeReady: boolean; supervisorReady: boolean;
  nodeVersion?: string; landlockAbi: number; maxArchiveMiB?: number;
  issues: { code: string }[]; warnings: { code: string }[];
}
export interface WebappEntry {
  id: string; key: string; label: string; version: string; target: string;
  revision: string; stateRevision: string; generation?: string;
  desiredState: string; observedState: string; backend: boolean;
  installedAt: number; url?: string; lastError?: string;
}
export interface WebappField {
  name: string; label: string; description?: string; required?: boolean;
  type: "text" | "textarea" | "number" | "boolean" | "select";
  default?: string | number | boolean; maxLength?: number; rows?: number;
  min?: number; max?: number; step?: number; placeholder?: string;
  source?: "desktop.agents"; options?: { label: string; value: string }[];
}
export interface WebappManifest {
  schemaVersion: 2; id: string; key: string; label: string; version: string; target: string;
  appConfig: Record<string, unknown>; userConfig?: { fields: WebappField[] };
  copilot?: { agentKey: string; references: { type: "skill"; id: string }[] };
  backend?: { command: { type: string; entry: string } };
}
export interface WebappPolicy {
  schemaVersion: 1; revision: string; agentKey?: string; skills: string[];
  connectors: { connectorId: string; adapter: "cli" | "mcp" }[];
  assistant: boolean; artifacts: boolean; connectPorts: number[];
}
export interface WebappConfiguration {
  entry: WebappEntry; manifest: WebappManifest; policy: WebappPolicy;
  userConfig: Record<string, string | number | boolean>; configRevision: string;
}
export interface WebappUpload { uploadId: string; sha256: string; size: number; createdAt: number }
export interface WebappReview extends WebappUpload {
  manifest: WebappManifest; expectedRevision: string; expandedBytes: number; fileCount: number;
}
export interface WebappLaunch { action: string; ticket: string; expiresAt: number }
export type WebappStateInput = Pick<WebappEntry, "revision" | "stateRevision">;
export type WebappPolicyInput = Omit<WebappPolicy, "schemaVersion" | "revision"> & { expectedRevision: string };

export interface WebappLogPage { text: string; cursor: string; reset: boolean }

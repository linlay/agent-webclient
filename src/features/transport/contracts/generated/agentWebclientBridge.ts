// Generated from src/shared/contracts/agent-webclient-bridge.ts.
// Do not edit this mirror directly.
// sha256:52f2b663f89e5f18ae762d90b66bc03c3afe9fe8ea6613c1fc7749d23f0ca6ea

/**
 * Canonical Desktop <-> Agent WebClient bridge contract.
 *
 * Keep this module self-contained: the generated mirror is consumed by the
 * separately released Agent WebClient bundle and must not depend on Electron.
 */

export const AGENT_WEBCLIENT_BRIDGE_VERSION = 3 as const;
export const AGENT_WEBCLIENT_PLATFORM_WS_TRANSPORT_VERSION = 1 as const;
export const AGENT_WEBCLIENT_PLATFORM_WS_GLOBAL =
  "__AGENT_WEBCLIENT_PLATFORM_WS__" as const;
export const AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL =
  "__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__" as const;
export const AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION =
  "workPanel.resource.downloadCurrent" as const;
export const AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION = 1 as const;

export type AgentWebclientWorkPanelResourceDownloadAction = {
  action: typeof AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION;
  version: typeof AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION;
};

export const AGENT_WEBCLIENT_PLATFORM_WS_OPEN_CHANNEL =
  "agentWebclient.platformWs.open" as const;
export const AGENT_WEBCLIENT_PLATFORM_WS_SEND_CHANNEL =
  "agentWebclient.platformWs.send" as const;
export const AGENT_WEBCLIENT_PLATFORM_WS_CLOSE_CHANNEL =
  "agentWebclient.platformWs.close" as const;
export const AGENT_WEBCLIENT_PLATFORM_WS_EVENT_CHANNEL =
  "agentWebclient.platformWs.event" as const;
export const AGENT_WEBCLIENT_WORKPANEL_INVOKE_CHANNEL =
  "agentWebclient.workpanel.invoke" as const;

export const AGENT_WEBCLIENT_BRIDGE_ERROR_CODES = [
  "bridge_unavailable",
  "version_mismatch",
  "invalid_request",
  "duplicate_id",
  "connection_unavailable",
  "connection_lost_before_acceptance",
  "capability_denied",
  "surface_unavailable",
  "target_unavailable",
  "ambiguous_action_target",
  "unsupported_in_current_view",
  "unsupported_native_surface",
  "seq_expired",
  "replay_required",
  "protocol_error",
  "backpressure",
] as const;

export type AgentWebclientBridgeErrorCode =
  (typeof AGENT_WEBCLIENT_BRIDGE_ERROR_CODES)[number];

export type AgentWebclientSurfaceKind =
  | "agent-chat"
  | "agent-copilot"
  | "agent-overview"
  | "agent-debug"
  | "agent-btw"
  | "agent-project";

export type AgentWebclientSurfaceCapability =
  | "run.query"
  | "run.attach"
  | "run.control"
  | "run.visible.read"
  | "push.subscribe"
  | "workpanel.open"
  | "workpanel.activate"
  | "workpanel.close"
  | "inbound.action.owner";

export type AgentWebclientConnectionPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closing"
  | "closed"
  | "error";

export type AgentWebclientBridgeError = {
  code: AgentWebclientBridgeErrorCode;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export type AgentWebclientRunOwner =
  | { kind: "agent"; agentKey: string }
  | { kind: "team"; teamId: string };

export type AgentWebclientBridgeFailure = {
  ok: false;
  error: AgentWebclientBridgeError;
};


export type AgentPlatformRequestFrame = {
  frame: "request";
  type: string;
  id: string;
  payload?: unknown;
};

export type AgentPlatformResponseFrame = {
  frame: "response";
  type?: string;
  id?: string;
  code?: number | string;
  status?: number;
  msg?: string;
  data?: unknown;
};

export type AgentPlatformStreamFrame = {
  frame: "stream";
  id?: string;
  streamId?: string;
  event?: Record<string, unknown>;
  reason?: string;
  lastSeq?: number;
};

export type AgentPlatformPushFrame = {
  frame: "push";
  type?: string;
  payload?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

export type AgentPlatformErrorFrame = {
  frame: "error";
  id?: string;
  type?: string;
  code?: number | string;
  status?: number;
  msg?: string;
  data?: unknown;
};

export type AgentPlatformRealtimeFrame =
  | AgentPlatformRequestFrame
  | AgentPlatformResponseFrame
  | AgentPlatformStreamFrame
  | AgentPlatformPushFrame
  | AgentPlatformErrorFrame;

export type AgentWebclientPlatformWsEvent =
  | { socketId: string; type: "open" }
  | { socketId: string; type: "message"; data: string }
  | { socketId: string; type: "error"; message: string }
  | { socketId: string; type: "close"; code: number; reason: string };

export type AgentWebclientPlatformWsOpenInput = { socketId: string };
export type AgentWebclientPlatformWsSendInput = { socketId: string; data: string };
export type AgentWebclientPlatformWsCloseInput = {
  socketId: string;
  code?: number;
  reason?: string;
};

export type DesktopPlatformSocketEventType = "open" | "message" | "error" | "close";

export type DesktopPlatformSocket = {
  readonly readyState: 0 | 1 | 2 | 3;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: DesktopPlatformSocketEventType, listener: (event: unknown) => void): void;
  removeEventListener(type: DesktopPlatformSocketEventType, listener: (event: unknown) => void): void;
};

export type DesktopPlatformWsBridge = {
  readonly transportVersion: typeof AGENT_WEBCLIENT_PLATFORM_WS_TRANSPORT_VERSION;
  createSocket(): DesktopPlatformSocket;
};

export type WorkPanelChatContext = { agentKey: string; chatId: string };
export type WorkPanelBTWContext = WorkPanelChatContext & { btwId?: string };
export type WorkPanelSourceContext = WorkPanelChatContext & {
  btwId?: string;
  publishId: string;
  sourceId: string;
};
export type WorkPanelPlanningContext = WorkPanelChatContext & { planningId: string };
export type WorkPanelArtifactContext = WorkPanelChatContext & { artifactId: string };
export type WorkPanelReferenceContext = WorkPanelChatContext & { referenceId: string };
export type WorkPanelFileContext = { agentKey: string; path: string };
export type WorkPanelProjectContext = {
  agentKey: string;
  chatId?: string;
  runId?: string;
  path?: string;
};
export type WorkPanelFileDiffContext = WorkPanelChatContext & { runId: string; path: string };
export type WorkPanelAgentContext = { agentKey: string; chatId?: string };

export type WorkPanelContext =
  | WorkPanelChatContext
  | WorkPanelBTWContext
  | WorkPanelSourceContext
  | WorkPanelPlanningContext
  | WorkPanelArtifactContext
  | WorkPanelReferenceContext
  | WorkPanelFileContext
  | WorkPanelProjectContext
  | WorkPanelFileDiffContext
  | WorkPanelAgentContext;

export type WorkPanelWebclientModule =
  | "overview"
  | "debug"
  | "btw"
  | "source"
  | "project"
  | "file-diff"
  | "artifact"
  | "reference"
  | "file"
  | "planning"
  | "agent"
  | "copilot";

type WorkPanelWebclientDescriptorBase = {
  kind: "webclient";
  route: string;
  title?: string;
  pinned?: boolean;
  closable?: boolean;
};

export type WorkPanelWebclientDescriptor = WorkPanelWebclientDescriptorBase & (
  | { module: "overview" | "debug"; context: WorkPanelChatContext }
  | { module: "btw"; context: WorkPanelBTWContext }
  | { module: "source"; context: WorkPanelSourceContext }
  | { module: "project"; context: WorkPanelProjectContext }
  | { module: "file-diff"; context: WorkPanelFileDiffContext }
  | { module: "artifact"; context: WorkPanelArtifactContext }
  | { module: "reference"; context: WorkPanelReferenceContext }
  | { module: "file"; context: WorkPanelFileContext }
  | { module: "planning"; context: WorkPanelPlanningContext }
  | { module: "agent" | "copilot"; context: WorkPanelAgentContext }
);

export type WorkPanelItemDescriptor =
  | WorkPanelWebclientDescriptor
  | {
      kind: "native";
      surfaceKey: string;
      context: Record<string, never>;
      title?: string;
      pinned?: boolean;
      closable?: boolean;
    }
  | {
      kind: "web";
      url: string;
      title?: string;
      pinned?: boolean;
      closable?: boolean;
    };

export type WorkPanelItem = {
  itemId: string;
  stableKey: string;
  descriptor: WorkPanelItemDescriptor;
  title: string;
  closable: boolean;
  pinned: boolean;
  createdAt: number;
};

export type WorkPanelWorkspace = {
  workspaceId: string;
  ownerChatId: string;
  items: WorkPanelItem[];
  activeItemId: string | null;
};

export type WorkPanelOpenItemInput = {
  version: typeof AGENT_WEBCLIENT_BRIDGE_VERSION;
  descriptor: WorkPanelItemDescriptor;
};

export type WorkPanelItemTargetInput = {
  version: typeof AGENT_WEBCLIENT_BRIDGE_VERSION;
  itemId: string;
};

export type WorkPanelBridgeResult =
  | { ok: true; workspaceId: string; item?: WorkPanelItem; state?: WorkPanelWorkspace }
  | AgentWebclientBridgeFailure;

export type WorkPanelCapability =
  | "workpanel.open"
  | "workpanel.activate"
  | "workpanel.close";

export type WorkPanelCapabilityResult =
  | { ok: true; capabilities: WorkPanelCapability[] }
  | AgentWebclientBridgeFailure;

export type AgentWebclientWorkPanelBridge = {
  getCapabilities(): Promise<WorkPanelCapabilityResult>;
  openItem(input: WorkPanelOpenItemInput): Promise<WorkPanelBridgeResult>;
  activateItem(input: WorkPanelItemTargetInput): Promise<WorkPanelBridgeResult>;
  closeItem(input: WorkPanelItemTargetInput): Promise<WorkPanelBridgeResult>;
};

export function isAgentWebclientBridgeVersion(value: unknown): value is 3 {
  return value === AGENT_WEBCLIENT_BRIDGE_VERSION;
}

export function isPlainBridgeRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isAgentWebclientSurfaceKind(value: unknown): value is AgentWebclientSurfaceKind {
  return [
    "agent-chat",
    "agent-copilot",
    "agent-overview",
    "agent-debug",
    "agent-btw",
    "agent-project",
  ].includes(String(value));
}

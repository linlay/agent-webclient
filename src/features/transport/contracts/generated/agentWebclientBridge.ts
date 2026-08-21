// Generated from src/shared/contracts/agent-webclient-bridge.ts.
// Do not edit this mirror directly.
// sha256:d28c04d0e9e56948844a35188ddb563333407bccda8d5b6422bde4759cd8a20f

/**
 * Canonical Desktop <-> Agent WebClient bridge contract.
 *
 * Keep this module self-contained: the generated mirror is consumed by the
 * separately released Agent WebClient bundle and must not depend on Electron.
 */

export const AGENT_WEBCLIENT_BRIDGE_VERSION = 4 as const;
export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_TRANSPORT_VERSION = 2 as const;
export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_GLOBAL =
  "__AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__" as const;
export const AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL =
  "__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__" as const;
export const AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION =
  "workPanel.resource.downloadCurrent" as const;
export const AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION = 1 as const;

export type AgentWebclientWorkPanelResourceDownloadAction = {
  action: typeof AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION;
  version: typeof AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION;
};

export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_OPEN_CHANNEL =
  "agentWebclient.platformFramePort.open" as const;
export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_SEND_CHANNEL =
  "agentWebclient.platformFramePort.send" as const;
export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_CLOSE_CHANNEL =
  "agentWebclient.platformFramePort.close" as const;
export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_EVENT_CHANNEL =
  "agentWebclient.platformFramePort.event" as const;
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
  | "agent-project"
  | "agent-management";

export type AgentWebclientSurfaceCapability =
  | "run.query"
  | "run.attach"
  | "run.control"
  | "run.visible.read"
  | "push.subscribe"
  | "workpanel.open"
  | "workpanel.activate"
  | "workpanel.close";

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

export type DesktopPlatformConnectionState = {
  phase: "connecting" | "connected" | "reconnecting" | "closed";
  logicalGeneration: number;
  physicalGeneration: number;
  reconnectCount: number;
  retryable: boolean;
  physicalSessionId?: string;
  lastInboundAt?: number;
  lastHeartbeatAt?: number;
  error?: { code: string; message: string };
};

export type DesktopPlatformSessionClose = {
  reason: "surface_inactive" | "disposed" | "identity_invalidated" | "protocol_mismatch" | "app_shutdown";
  error?: { code: string; message: string };
};

export type AgentWebclientPlatformFramePortEvent =
  | { sessionId: string; type: "frame"; frame: AgentPlatformRealtimeFrame }
  | { sessionId: string; type: "state"; state: DesktopPlatformConnectionState }
  | { sessionId: string; type: "close"; event: DesktopPlatformSessionClose };

export type AgentWebclientPlatformFramePortOpenInput = { sessionId: string };
export type AgentWebclientPlatformFramePortSendInput = {
  sessionId: string;
  frame: AgentPlatformRequestFrame;
};
export type AgentWebclientPlatformFramePortCloseInput = {
  sessionId: string;
  reason?: "surface_inactive" | "disposed";
};

export type DesktopPlatformSession = {
  send(frame: AgentPlatformRequestFrame): void;
  close(reason?: "surface_inactive" | "disposed"): void;
  onFrame(listener: (frame: Exclude<AgentPlatformRealtimeFrame, AgentPlatformRequestFrame>) => void): () => void;
  onState(listener: (state: DesktopPlatformConnectionState) => void): () => void;
  onClose(listener: (event: DesktopPlatformSessionClose) => void): () => void;
};

export type DesktopPlatformFramePort = {
  readonly transportVersion: typeof AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_TRANSPORT_VERSION;
  createSession(): DesktopPlatformSession;
};

export type WorkPanelChatContext = { agentKey: string; chatId: string };
export type WorkPanelBTWContext = WorkPanelChatContext & { btwId?: string };
export type WorkPanelSourceContext = WorkPanelChatContext & {
  btwId?: string;
  publishId: string;
  sourceId: string;
};
export type WorkPanelPlanningContext = { chatId: string; planningId: string };
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
export type WorkPanelSkillContext = { key: string };

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
  | WorkPanelAgentContext
  | WorkPanelSkillContext;

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
  | "copilot"
  | "skill";

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
  | { module: "skill"; context: WorkPanelSkillContext }
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

export function isAgentWebclientBridgeVersion(value: unknown): value is 4 {
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
    "agent-management",
  ].includes(String(value));
}

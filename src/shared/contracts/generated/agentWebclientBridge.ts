// Generated from src/shared/contracts/agent-webclient-bridge.ts.
// Do not edit this mirror directly.
// sha256:cce889071d465fa93f36a442f048593d5f3076fbcfef927f79b67c5a3f829d5d

/**
 * Canonical Desktop <-> Agent WebClient bridge contract.
 *
 * Keep this module self-contained: the generated mirror is consumed by the
 * separately released Agent WebClient bundle and must not depend on Electron.
 */

export const AGENT_WEBCLIENT_BRIDGE_VERSION = 6 as const;
export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_TRANSPORT_VERSION = 2 as const;
export const AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_GLOBAL =
  "__AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__" as const;
export const AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL =
  "__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__" as const;
// Appearance has its own version and revision; it is never a navigation or
// Platform Frame Port operation. No wallpaper bytes or filesystem paths cross it.
export const AGENT_WEBCLIENT_APPEARANCE_GLOBAL = "__AGENT_WEBCLIENT_APPEARANCE__" as const;
export const AGENT_WEBCLIENT_APPEARANCE_REQUEST_CHANNEL = "desktop:service-webview:appearance:request" as const;
export const AGENT_WEBCLIENT_APPEARANCE_SNAPSHOT_CHANNEL = "desktop:service-webview:appearance:snapshot" as const;
export const AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS = [
  "--bg-base", "--surface", "--surface-strong", "--surface-soft", "--surface-sidebar",
  "--ink", "--ink-soft", "--ink-muted", "--line", "--line-strong",
  "--accent", "--accent-strong", "--accent-soft", "--accent-on",
  "--control-button-bg", "--control-select-bg", "--control-input-bg", "--control-border",
  "--control-hover-bg", "--control-active-bg", "--control-disabled-bg",
  "--control-icon-color", "--control-icon-hover-color", "--control-primary-bg",
  "--control-primary-hover", "--control-primary-active", "--control-popover-bg",
  "--control-tab-strip-bg", "--control-tab-active-bg", "--control-tab-hover-bg",
  "--nav-hover-bg", "--nav-selected-bg", "--nav-selected-text", "--nav-accent-selected-bg",
  "--desktop-overlay-panel-bg", "--sidebar-operation-menu-bg", "--sidebar-operation-menu-border",
  "--modal-mask-bg", "--shell-sidebar-bg", "--shell-content-bg", "--shell-titlebar-bg"
] as const;
export const AGENT_WEBCLIENT_APPEARANCE_RADIUS_TOKENS = [
  "--control-radius", "--control-radius-sm", "--control-radius-lg", "--overlay-radius"
] as const;
export type AgentWebclientAppearanceToken =
  | typeof AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS[number]
  | typeof AGENT_WEBCLIENT_APPEARANCE_RADIUS_TOKENS[number]
  | "--control-disabled-opacity";
export type AgentWebclientAppearanceTokens = Partial<Record<AgentWebclientAppearanceToken, string>>;
export type AgentWebclientAppearanceSnapshot = {
  schemaVersion: "1.1";
  revision: number;
  resolvedTheme: "light" | "dark";
  skinId: string;
  tokens: AgentWebclientAppearanceTokens;
  background: { mode: "host" | "opaque" };
};
export type AgentWebclientAppearanceBridge = {
  readonly version: "1.1";
  getSnapshot(): Promise<AgentWebclientAppearanceSnapshot | null>;
  subscribe(listener: (snapshot: AgentWebclientAppearanceSnapshot | null) => void): () => void;
};

function appearanceRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

// Shared by the ZIP manifest parser and live bridge. Derived values such as
// --accent-rgb are owned by each renderer and are intentionally not transmitted.
export function parseAgentWebclientAppearanceTokens(value: unknown): AgentWebclientAppearanceTokens | null {
  if (!appearanceRecord(value) || Object.keys(value).length > 47) return null;
  const tokens: AgentWebclientAppearanceTokens = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string" || raw.length > 64 || /[\x00-\x1f\x7f]/.test(raw)) return null;
    const color = (AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS as readonly string[]).includes(key);
    if (color) {
      const text = raw.trim();
      if (text !== "transparent" && !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)) {
        const match = /^(rgb|rgba)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d{1,4}))?\s*\)$/.exec(text);
        if (!match || [match[2], match[3], match[4]].some((part) => Number(part) > 255) ||
          (match[1] === "rgba") !== (match[5] !== undefined)) return null;
      }
      tokens[key as AgentWebclientAppearanceToken] = text;
    } else if ((AGENT_WEBCLIENT_APPEARANCE_RADIUS_TOKENS as readonly string[]).includes(key)) {
      if (!/^\d{1,2}px$/.test(raw) || Number.parseInt(raw) > 32) return null;
      tokens[key as AgentWebclientAppearanceToken] = raw;
    } else if (key === "--control-disabled-opacity") {
      if (!/^(0|1|0?\.\d{1,3})$/.test(raw)) return null;
      tokens[key] = raw;
    } else return null;
  }
  return tokens;
}

export function parseAgentWebclientAppearanceSnapshot(value: unknown): AgentWebclientAppearanceSnapshot | null {
  if (!appearanceRecord(value) || value.schemaVersion !== "1.1" ||
    !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
    (value.resolvedTheme !== "light" && value.resolvedTheme !== "dark") ||
    typeof value.skinId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(value.skinId) ||
    Object.keys(value).some((key) => !["schemaVersion", "revision", "resolvedTheme", "skinId", "tokens", "background"].includes(key)) ||
    !appearanceRecord(value.background) || Object.keys(value.background).length !== 1 ||
    (value.background.mode !== "host" && value.background.mode !== "opaque")) return null;
  const tokens = parseAgentWebclientAppearanceTokens(value.tokens);
  return tokens ? {
    schemaVersion: "1.1", revision: Number(value.revision), resolvedTheme: value.resolvedTheme,
    skinId: value.skinId, tokens, background: { mode: value.background.mode }
  } : null;
}
export const AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION =
  "workPanel.resource.downloadCurrent" as const;
export const AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION = 1 as const;
export const AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION =
  "workPanel.previewReview.dispatch" as const;
export const AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION = 1 as const;
export const AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT =
  "__agentWebclientWorkPanelPreviewReviewEvent" as const;
export const AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION =
  "workPanel.composer.insertDraft" as const;
export const AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION = 1 as const;
export const AGENT_WEBCLIENT_SELECTION_ACTION =
  "selectionToolbar.execute" as const;
export const AGENT_WEBCLIENT_SELECTION_ACTION_VERSION = 1 as const;
export const AGENT_WEBCLIENT_SELECTION_ACTION_RESULT_PAGE_EVENT =
  "__agentWebclientSelectionActionResult" as const;

export type AgentWebclientSelectionActionId =
  | "add-to-chat"
  | "more-details"
  | "ask-in-side-chat";

export type AgentWebclientSelectionTargetKind = "message" | "code";

export type AgentWebclientSelectionPoint = {
  x: number;
  y: number;
};

export type AgentWebclientSelectionAction = {
  action: typeof AGENT_WEBCLIENT_SELECTION_ACTION;
  version: typeof AGENT_WEBCLIENT_SELECTION_ACTION_VERSION;
  requestId: string;
  selectionId: string;
  operation: AgentWebclientSelectionActionId;
  targetId: string;
  targetKind: AgentWebclientSelectionTargetKind;
  start: AgentWebclientSelectionPoint;
  end: AgentWebclientSelectionPoint;
};

export type AgentWebclientSelectionActionErrorCode =
  | "stale_selection"
  | "chat_required"
  | "selection_too_large"
  | "surface_not_ready"
  | "run_start_failed";

export type AgentWebclientSelectionActionResult = {
  version: typeof AGENT_WEBCLIENT_SELECTION_ACTION_VERSION;
  requestId: string;
  ok: boolean;
  code?: AgentWebclientSelectionActionErrorCode;
  handoff?: {
    chatId: string;
    runId: string;
  };
};

export type AgentWebclientWorkPanelResourceDownloadAction = {
  action: typeof AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION;
  version: typeof AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION;
};

export type AgentWebclientWorkPanelPreviewReviewAction = {
  action: typeof AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION;
  version: typeof AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION;
  requestId: string;
  operation: "capabilities" | "initialize" | "sync" | "export-image";
  enabled?: boolean;
  kind?: "html" | "image";
  annotations?: unknown[];
};

export type AgentWebclientComposerDraftAction = {
  action: typeof AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION;
  version: typeof AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION;
  requestId: string;
  ownerChatId: string;
  text: string;
  attachment?: {
    name: string;
    mimeType: "image/png";
    dataBase64: string;
    sizeBytes: number;
  };
  reviewData: {
    version: 1;
    sourceKind: "workspace-file" | "artifact" | "reference" | "web";
    kind: "html" | "image" | "markdown" | "text" | "code";
    source: {
      fileName: string;
      revision: string;
      relativePath?: string;
      resourceId?: string;
      url?: string;
    };
    annotations: unknown[];
  };
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
  "unsupported_native_type",
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
  | "agent-selection-explain"
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
export type WorkPanelBTWContext = WorkPanelChatContext & {
  btwId?: string;
  instanceId?: string;
};
export type WorkPanelSourceContext = WorkPanelChatContext & {
  btwId?: string;
  publishId: string;
  sourceId: string;
};
export type WorkPanelPlanningContext = { chatId: string; planningId: string };
export type WorkPanelArtifactContext = WorkPanelChatContext & { artifactId: string; relativePath?: string };
export type WorkPanelReferenceContext = WorkPanelChatContext & { referenceId: string; relativePath?: string };
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
      context: Record<string, string | number | boolean>;
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
    }
  | {
      kind: "webapp-ref";
      webappId: string;
      title: string;
      pinned?: boolean;
      closable?: boolean;
    }
  | {
      kind: "local-file";
      handleId: string;
      fileName: string;
      previewKind: "html" | "pdf" | "image" | "text" | "audio" | "video" | "unsupported";
      reviewKind?: "html" | "image";
      workspaceRelativePath?: string;
      reviewRevision?: string;
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

export type WorkPanelOpenResourceInput = {
  version: typeof AGENT_WEBCLIENT_BRIDGE_VERSION;
  profile: "artifact" | "reference";
  agentKey: string;
  chatId: string;
  resourceId: string;
  relativePath: string;
  title?: string;
};

export type WorkPanelOpenResourceResult =
  | {
      ok: true;
      workspaceId: string;
      itemId: string;
      renderer: "native-image";
    }
  | AgentWebclientBridgeFailure;

export type WorkPanelDocumentSource =
  | { kind: "workspace-file"; agentKey: string; path: string }
  | {
      kind: "artifact" | "reference";
      agentKey: string;
      chatId: string;
      resourceId: string;
      relativePath: string;
    };

export type WorkPanelOpenDocumentInput = {
  version: typeof AGENT_WEBCLIENT_BRIDGE_VERSION;
  source: WorkPanelDocumentSource;
  title?: string;
};

export type WorkPanelOpenDocumentResult =
  | {
      ok: true;
      workspaceId: string;
      itemId: string;
      renderer: "native-html" | "native-image";
    }
  | AgentWebclientBridgeFailure;

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
  openDocument(input: WorkPanelOpenDocumentInput): Promise<WorkPanelOpenDocumentResult>;
  openResource(input: WorkPanelOpenResourceInput): Promise<WorkPanelOpenResourceResult>;
  openItem(input: WorkPanelOpenItemInput): Promise<WorkPanelBridgeResult>;
  activateItem(input: WorkPanelItemTargetInput): Promise<WorkPanelBridgeResult>;
  closeItem(input: WorkPanelItemTargetInput): Promise<WorkPanelBridgeResult>;
};

export function isAgentWebclientBridgeVersion(
  value: unknown,
): value is typeof AGENT_WEBCLIENT_BRIDGE_VERSION {
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
    "agent-selection-explain",
    "agent-project",
    "agent-management",
  ].includes(String(value));
}
// Connector authorization is independent of WorkPanel and Platform Frame Port versions.
export const CONNECTOR_AUTH_BROWSER_GLOBAL = "__AGENT_WEBCLIENT_CONNECTOR_AUTH_BROWSER__";
export const CONNECTOR_AUTH_BROWSER_CHANNEL = "connectorAuth.browser";
export const CONNECTOR_AUTH_BROWSER_EVENT = "connectorAuth.browser.event";
export const CONNECTOR_AUTH_BROWSER_HOST_EVENT = "connectorAuth.browser.host";
export const CONNECTOR_AUTH_BROWSER_HOST_CLOSE = "connectorAuth.browser.hostClose";
export interface ConnectorAuthBrowserIdentity { connectorId: string; sessionId: string; }
export interface ConnectorAuthBrowserBridge {
  readonly version: 1;
  open(input: ConnectorAuthBrowserIdentity): Promise<void>;
  close(input: ConnectorAuthBrowserIdentity): Promise<void>;
  subscribe(listener: (event: ConnectorAuthBrowserIdentity) => void): () => void;
}
export interface ConnectorAuthBrowserDialog extends ConnectorAuthBrowserIdentity {
  dialogId: string;
  url: string;
  partition: string;
}

// Appearance 1.1 transfers visual metadata separately from on-demand PNG bytes.
// Only current trusted documents may read the active skin resources.
export const SKIN_VISUAL_SLOTS = [
  "navigation.search", "navigation.back", "navigation.forward", "navigation.sidebar_left", "navigation.sidebar_right",
  "navigation.refresh", "navigation.more_actions", "entry.kanban", "entry.automation", "entry.new_chat", "entry.new_project",
  "entry.chat", "entry.project", "entry.website", "chat.send", "chat.stop", "chat.attach", "chat.expand", "chat.collapse", "chat.voice", "chat.screenshot",
  "agent.default", "agent.terminal", "agent.database", "agent.library", "agent.folder", "agent.coder", "agent.kbase",
  "heading.pinned.zh-CN", "heading.pinned.en-US",
  "heading.chats.zh-CN", "heading.projects.zh-CN", "heading.websites.zh-CN",
  "heading.chats.en-US", "heading.projects.en-US", "heading.websites.en-US"
] as const;
export type SkinVisualSlot = typeof SKIN_VISUAL_SLOTS[number];
export type SkinVisualStyles = {
  unread?: string; unreadText?: string; pending?: string; pendingText?: string;
  unreadShape?: "circle" | "heart";
  /** Optional 3–64 polygon vertices in percentage coordinates; overrides unreadShape. */
  unreadOutline?: [number, number][];
  badgeShape?: "round" | "pill";
  headingStyle?: "default" | "rounded";
};
export type SkinVisuals = { images: Partial<Record<SkinVisualSlot, string>>; styles: SkinVisualStyles };
export const SKIN_VISUAL_LIMITS = { assetBytes: 256 * 1024, totalBytes: 4 * 1024 * 1024, maxDimension: 1024 } as const;
export function parseSkinVisuals(value: unknown, parseImage: (value: unknown) => string | null): SkinVisuals | null {
  if (!appearanceRecord(value) || Object.keys(value).some(key => !["images", "styles"].includes(key))) return null;
  const images = value.images ?? {}, styles = value.styles ?? {};
  if (!appearanceRecord(images) || !appearanceRecord(styles) || Object.keys(images).length > SKIN_VISUAL_SLOTS.length) return null;
  const result: SkinVisuals = { images: {}, styles: {} };
  for (const [key, raw] of Object.entries(images)) {
    if (!(SKIN_VISUAL_SLOTS as readonly string[]).includes(key)) return null;
    const image = parseImage(raw);
    if (!image) return null;
    result.images[key as SkinVisualSlot] = image;
  }
  for (const [key, raw] of Object.entries(styles)) {
    if (["unread", "unreadText", "pending", "pendingText"].includes(key)) {
      const color = parseAgentWebclientAppearanceTokens({ "--accent": raw })?.["--accent"];
      // Indicators must remain visible; alpha/transparent are intentionally excluded.
      if (!color || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) return null;
      result.styles[key as "unread"] = color;
    } else if (key === "unreadShape" && typeof raw === "string" && ["circle", "heart"].includes(raw)) result.styles.unreadShape = raw as "circle" | "heart";
    else if (key === "unreadOutline") {
      if (!Array.isArray(raw) || raw.length < 3 || raw.length > 64 || raw.some(point =>
        !Array.isArray(point) || point.length !== 2 || point.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100))) return null;
      result.styles.unreadOutline = raw.map(point => [point[0], point[1]]);
    }
    else if (key === "badgeShape" && typeof raw === "string" && ["round", "pill"].includes(raw)) result.styles.badgeShape = raw as "round" | "pill";
    else if (key === "headingStyle" && typeof raw === "string" && ["default", "rounded"].includes(raw)) result.styles.headingStyle = raw as "default" | "rounded";
    else return null;
  }
  return result;
}
export function skinVisualStyleVariables(styles: SkinVisualStyles): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ["unread", "unreadText", "pending", "pendingText"] as const) {
    if (styles[key]) result[`--skin-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`] = styles[key]!;
  }
  if (styles.badgeShape) result["--skin-badge-radius"] = styles.badgeShape === "pill" ? "6px" : "999px";
  if (styles.badgeShape) result["--skin-badge-padding"] = "3px";
  if (styles.headingStyle === "rounded") result["--skin-heading-font"] = 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
  if (styles.unreadShape) result["--skin-unread-clip"] = styles.unreadShape === "heart"
    ? "polygon(50% 95%, 5% 48%, 0% 25%, 12% 8%, 30% 5%, 50% 23%, 70% 5%, 88% 8%, 100% 25%, 95% 48%)" : "none";
  if (styles.unreadOutline) result["--skin-unread-clip"] = `polygon(${styles.unreadOutline.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;
  return result;
}
export const AGENT_WEBCLIENT_VISUALS_GLOBAL = "__AGENT_WEBCLIENT_VISUALS__" as const;
export const AGENT_WEBCLIENT_VISUALS_CHANNEL = "desktop:service-webview:visuals" as const;
export const AGENT_WEBCLIENT_VISUAL_ASSET_CHANNEL = "desktop:service-webview:visual-asset" as const;
export type AgentWebclientVisualSnapshot = { schemaVersion: "1.1"; revision: number; resourceSet: string; visuals: SkinVisuals };
export type AgentWebclientVisualBridge = {
  readonly version: "1.1";
  getSnapshot(): Promise<AgentWebclientVisualSnapshot | null>;
  subscribe(listener: (value: AgentWebclientVisualSnapshot | null) => void): () => void;
  getAsset(resourceSet: string, slot: SkinVisualSlot): Promise<string | null>;
};
export function parseAgentWebclientVisualSnapshot(value: unknown): AgentWebclientVisualSnapshot | null {
  if (!appearanceRecord(value) || value.schemaVersion !== "1.1" || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
    typeof value.resourceSet !== "string" || !/^[a-f\d-]{36}$/i.test(value.resourceSet) ||
    Object.keys(value).some(key => !["schemaVersion", "revision", "resourceSet", "visuals"].includes(key))) return null;
  const visuals = parseSkinVisuals(value.visuals, raw => typeof raw === "string" && (SKIN_VISUAL_SLOTS as readonly string[]).includes(raw) ? raw : null);
  if (!visuals || Object.entries(visuals.images).some(([slot, id]) => slot !== id)) return null;
  return { schemaVersion: "1.1", revision: Number(value.revision), resourceSet: value.resourceSet, visuals };
}
export function isSkinVisualDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > Math.ceil(SKIN_VISUAL_LIMITS.assetBytes / 3) * 4 + 22 ||
    (value.length - 22) % 4 !== 0 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  try {
    // Inspect the PNG header before an image element can allocate a bitmap.
    const header = atob(value.slice(22, 66));
    if (header.length < 33 || header.slice(12, 16) !== "IHDR") return false;
    const integer = (offset: number) => [0, 1, 2, 3].reduce((total, index) => total * 256 + header.charCodeAt(offset + index), 0);
    const width = integer(16), height = integer(20);
    return integer(8) === 13 && width > 0 && height > 0 && width <= SKIN_VISUAL_LIMITS.maxDimension && height <= SKIN_VISUAL_LIMITS.maxDimension;
  } catch { return false; }
}

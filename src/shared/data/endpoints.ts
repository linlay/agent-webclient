import {
  compactPayload,
  createEndpointRegistry,
  defineEndpoint,
} from "@/shared/data/endpointRegistry";
import type {
  ArchivesRequest,
  AttachStreamParams,
  GetAgentsOptions,
  GetChatsOptions,
  GetMemoryRecordsParams,
  QueryModelOverride,
  QueryReasoningEffort,
  QueryServiceTier,
  QueryStreamParams,
} from "@/shared/data/client";

export function compactQueryModelOverride(
  model: QueryModelOverride | undefined,
): QueryModelOverride | null {
  if (!model) {
    return null;
  }
  const key = String(model.key || "").trim();
  const reasoningEffort = String(model.reasoningEffort || "").trim() as
    | QueryReasoningEffort
    | "";
  const serviceTier = String(model.serviceTier || "").trim().toUpperCase() as
    | QueryServiceTier
    | "";
  if (!key && !reasoningEffort && (!serviceTier || serviceTier === "STANDARD")) {
    return null;
  }
  return {
    ...(key ? { key } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(serviceTier && serviceTier !== "STANDARD" ? { serviceTier } : {}),
  };
}

export function buildQueryPayload(options: QueryStreamParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    requestId: options.requestId,
    message: options.message,
  };

  if (String(options.agentMode || "").trim().toUpperCase() === "CODER") {
    body.planningMode = options.planningMode === true;
  }

  if (options.agentKey) body.agentKey = options.agentKey;
  if (options.teamId) body.teamId = options.teamId;
  if (options.chatId) body.chatId = options.chatId;
  if (options.accessLevel) body.accessLevel = options.accessLevel;
  const model = compactQueryModelOverride(options.model);
  if (model) body.model = model;
  if (options.role) body.role = options.role;
  if (options.references !== undefined) body.references = options.references;
  if (options.params !== undefined) body.params = options.params;
  if (options.scene) body.scene = options.scene;
  if (options.stream !== undefined) body.stream = options.stream;

  return body;
}

export function buildAttachPayload(options: AttachStreamParams): {
  runId: string;
  agentKey: string;
  lastSeq: number;
} {
  const lastSeq = Number(options.lastSeq ?? 0);
  return {
    runId: String(options.runId || "").trim(),
    agentKey: String(options.agentKey || "").trim(),
    lastSeq: Number.isFinite(lastSeq) && lastSeq >= 0 ? lastSeq : 0,
  };
}

export const dataEndpoints = createEndpointRegistry({
  accessLevelUpdate: defineEndpoint({
    key: "accessLevel.update",
    path: "/api/access-level",
    method: "POST",
    transport: "auto",
  }),
  adminAgentCreate: defineEndpoint({
    key: "admin.agents.create",
    path: "/api/admin/agents/create",
    method: "POST",
    transport: "http",
  }),
  adminAgentDelete: defineEndpoint({
    key: "admin.agents.delete",
    path: "/api/admin/agents/delete",
    method: "POST",
    transport: "http",
  }),
  adminAgentDetail: defineEndpoint({
    key: "admin.agents.detail",
    path: "/api/admin/agents/detail",
    method: "GET",
    transport: "http",
    payload: (agentKey: string) => ({ agentKey }),
  }),
  adminAgentEditorOptions: defineEndpoint({
    key: "admin.agents.editorOptions",
    path: "/api/admin/agents/editor-options",
    method: "GET",
    transport: "http",
    cache: { ttlMs: 60_000, dedupe: true },
  }),
  adminAgentOrder: defineEndpoint({
    key: "admin.agents.order",
    path: "/api/admin/agents/order",
    method: "GET",
    transport: "http",
  }),
  adminAgentOrderUpdate: defineEndpoint({
    key: "admin.agents.order.update",
    path: "/api/admin/agents/order",
    method: "PUT",
    transport: "http",
  }),
  adminAgents: defineEndpoint({
    key: "admin.agents.list",
    path: "/api/admin/agents",
    method: "GET",
    transport: "http",
    cache: { ttlMs: 10_000, dedupe: true },
  }),
  adminAgentUpdate: defineEndpoint({
    key: "admin.agents.update",
    path: "/api/admin/agents/update",
    method: "POST",
    transport: "http",
  }),
  adminAgentUpdateName: defineEndpoint({
    key: "admin.agents.updateName",
    path: "/api/admin/agents/update-name",
    method: "POST",
    transport: "http",
  }),
  adminRegistries: defineEndpoint({
    key: "admin.registries.list",
    path: "/api/admin/registries",
    method: "GET",
    transport: "http",
  }),
  adminServices: defineEndpoint({
    key: "admin.services.list",
    path: "/api/admin/services",
    method: "GET",
    transport: "http",
  }),
  adminRegistryDetail: defineEndpoint({
    key: "admin.registries.detail",
    path: "/api/admin/registries/detail",
    method: "GET",
    transport: "http",
    payload: (params: { category: string; file: string }) =>
      compactPayload(params),
  }),
  adminRegistryValidate: defineEndpoint({
    key: "admin.registries.validate",
    path: "/api/admin/registries/validate",
    method: "POST",
    transport: "http",
  }),
  adminSkills: defineEndpoint<string | undefined, Record<string, unknown>>({
    key: "admin.skills.list",
    path: "/api/admin/skills",
    method: "GET",
    transport: "http",
    payload: (tag) => compactPayload({ tag }),
  }),
  adminTools: defineEndpoint<
    { tag?: string; kind?: string; sourceCategory?: "platform" | "external" | "mcp" },
    Record<string, unknown>
  >({
    key: "admin.tools.list",
    path: "/api/admin/tools",
    method: "GET",
    transport: "http",
    payload: (params = {}) => compactPayload(params),
  }),
  agent: defineEndpoint<string, { agentKey: string }>({
    key: "agent.detail",
    path: "/api/agent",
    method: "GET",
    transport: "auto",
    payload: (agentKey) => ({ agentKey }),
  }),
  agentModelConfig: defineEndpoint({
    key: "agent.modelConfig.update",
    path: "/api/agent/model-config",
    method: "POST",
    transport: "auto",
  }),
  agentOpenWorkspace: defineEndpoint({
    key: "agent.openWorkspace",
    path: "/api/agent/open-workspace",
    method: "POST",
    transport: "http",
  }),
  agentOrder: defineEndpoint({
    key: "agents.order",
    path: "/api/agents/order",
    method: "GET",
    transport: "auto",
  }),
  agentOrderUpdate: defineEndpoint({
    key: "agents.order.update",
    path: "/api/agents/order",
    method: "PUT",
    transport: "auto",
  }),
  agents: defineEndpoint<GetAgentsOptions, Record<string, unknown>>({
    key: "agents.list",
    path: "/api/agents",
    method: "GET",
    transport: "auto",
    cache: { ttlMs: 8_000, dedupe: true },
    payload: (options = {}) =>
      compactPayload({
        includeChats: options.includeChats,
        scope: options.scope,
      }),
  }),
  archive: defineEndpoint<
    { chatId: string; includeRawMessages?: boolean },
    Record<string, unknown>
  >({
    key: "archive.detail",
    path: "/api/archive",
    method: "GET",
    transport: "auto",
    payload: ({ chatId, includeRawMessages }) =>
      compactPayload({
        chatId,
        includeRawMessages: includeRawMessages ? true : undefined,
      }),
  }),
  archiveDelete: defineEndpoint<{ chatId: string }, { chatId: string }>({
    key: "archive.delete",
    path: "/api/archive/delete",
    method: "POST",
    transport: "auto",
    payload: ({ chatId }) => ({ chatId }),
  }),
  archiveRestore: defineEndpoint({
    key: "archive.restore",
    path: "/api/archive/restore",
    method: "POST",
    transport: "auto",
  }),
  archives: defineEndpoint<ArchivesRequest, Record<string, unknown>>({
    key: "archives.list",
    path: "/api/archives",
    method: "GET",
    transport: "auto",
    payload: (params = {}) =>
      compactPayload({
        agentKey: params.agentKey,
        limit: params.limit,
        offset: params.offset,
      }),
  }),
  archivesSearch: defineEndpoint({
    key: "archives.search",
    path: "/api/archives/search",
    method: "POST",
    transport: "auto",
  }),
  attach: defineEndpoint<AttachStreamParams>({
    key: "runs.attach",
    path: "/api/attach",
    method: "GET",
    transport: "sse",
    payload: buildAttachPayload,
  }),
  automation: defineEndpoint({
    key: "automation.detail",
    path: "/api/automation",
    method: "GET",
    transport: "http",
  }),
  automationCreate: defineEndpoint({
    key: "automation.create",
    path: "/api/automation/create",
    method: "POST",
    transport: "http",
  }),
  automationDelete: defineEndpoint({
    key: "automation.delete",
    path: "/api/automation/delete",
    method: "POST",
    transport: "http",
  }),
  automationExecutions: defineEndpoint({
    key: "automation.executions",
    path: "/api/automation/executions",
    method: "GET",
    transport: "http",
  }),
  automationToggle: defineEndpoint({
    key: "automation.toggle",
    path: "/api/automation/toggle",
    method: "POST",
    transport: "http",
  }),
  automationUpdate: defineEndpoint({
    key: "automation.update",
    path: "/api/automation/update",
    method: "POST",
    transport: "http",
  }),
  automations: defineEndpoint({
    key: "automations.list",
    path: "/api/automations",
    method: "GET",
    transport: "http",
  }),
  chat: defineEndpoint<
    { chatId: string; includeRawMessages?: boolean },
    Record<string, unknown>
  >({
    key: "chat.detail",
    path: "/api/chat",
    method: "GET",
    transport: "auto",
    payload: ({ chatId, includeRawMessages }) =>
      compactPayload({
        chatId,
        includeRawMessages: includeRawMessages ? true : undefined,
      }),
  }),
  chatArchive: defineEndpoint({
    key: "chat.archive",
    path: "/api/chat/archive",
    method: "POST",
    transport: "auto",
  }),
  chatDelete: defineEndpoint<{ chatId: string }, { chatId: string }>({
    key: "chat.delete",
    path: "/api/chat/delete",
    method: "POST",
    transport: "auto",
    payload: ({ chatId }) => ({ chatId }),
  }),
  chatExport: defineEndpoint({
    key: "chat.export",
    path: "/api/chat-export",
    method: "GET",
    transport: "resource",
  }),
  chatJsonl: defineEndpoint<{ chatId: string }, { chatId: string }>({
    key: "chat.jsonl",
    path: "/api/chat/jsonl",
    method: "GET",
    transport: "auto",
    payload: ({ chatId }) => ({ chatId }),
  }),
  chatLlmTrace: defineEndpoint<{ file: string }, { file: string }>({
    key: "chat.llmTrace",
    path: "/api/chat/llm-trace",
    method: "GET",
    transport: "auto",
    payload: ({ file }) => ({ file }),
  }),
  chatRename: defineEndpoint({
    key: "chat.rename",
    path: "/api/chat/rename",
    method: "POST",
    transport: "auto",
  }),
  chats: defineEndpoint<GetChatsOptions, Record<string, unknown>>({
    key: "chats.list",
    path: "/api/chats",
    method: "GET",
    transport: "auto",
    cache: { ttlMs: 5_000, dedupe: true },
    payload: (options = {}) =>
      compactPayload({ agentKey: options.agentKey }),
  }),
  compact: defineEndpoint({
    key: "chat.compact",
    path: "/api/compact",
    method: "POST",
    transport: "auto",
  }),
  detach: defineEndpoint({
    key: "runs.detach",
    path: "/api/detach",
    method: "POST",
    transport: "ws",
  }),
  feedback: defineEndpoint({
    key: "feedback.submit",
    path: "/api/feedback",
    method: "POST",
    transport: "auto",
  }),
  fileHistory: defineEndpoint<
    {
      chatId?: string;
      runId: string;
      filePath: string;
      version: "original" | "current";
    },
    Record<string, unknown>
  >({
    key: "file.history",
    path: "/api/file/history",
    method: "GET",
    transport: "http",
    payload: (params) =>
      compactPayload({
        chatId: params.chatId,
        runId: params.runId,
        filePath: params.filePath,
        version: params.version,
      }),
  }),
  interrupt: defineEndpoint({
    key: "runs.interrupt",
    path: "/api/interrupt",
    method: "POST",
    transport: "auto",
  }),
  learn: defineEndpoint({
    key: "chat.learn",
    path: "/api/learn",
    method: "POST",
    transport: "auto",
  }),
  memoryContextPreview: defineEndpoint({
    key: "memory.contextPreview",
    path: "/api/memory/context-preview",
    method: "POST",
    transport: "auto",
  }),
  memoryMeta: defineEndpoint({
    key: "memory.meta",
    path: "/api/memory/meta",
    method: "GET",
    transport: "auto",
    cache: { ttlMs: 30_000, dedupe: true },
  }),
  memoryRecordDetail: defineEndpoint<
    { agentKey?: string; recordId: string },
    Record<string, unknown>
  >({
    key: "memory.record.detail",
    path: "/api/memory/record/detail",
    method: "GET",
    transport: "auto",
    payload: (params) => compactPayload(params),
  }),
  memoryRecords: defineEndpoint<GetMemoryRecordsParams, Record<string, unknown>>({
    key: "memory.records",
    path: "/api/memory/record/list",
    method: "GET",
    transport: "auto",
    payload: (params) => compactPayload(params as Record<string, unknown>),
  }),
  memoryScope: defineEndpoint<
    { agentKey: string; scopeType: string; scopeKey?: string },
    Record<string, unknown>
  >({
    key: "memory.scope.detail",
    path: "/api/memory/scope/detail",
    method: "GET",
    transport: "auto",
    payload: (params) => compactPayload(params),
  }),
  memoryScopeSave: defineEndpoint({
    key: "memory.scope.save",
    path: "/api/memory/scope/save",
    method: "POST",
    transport: "auto",
  }),
  memoryScopeValidate: defineEndpoint({
    key: "memory.scope.validate",
    path: "/api/memory/scope/validate",
    method: "POST",
    transport: "auto",
  }),
  memoryScopes: defineEndpoint<string, { agentKey: string }>({
    key: "memory.scopes",
    path: "/api/memory/scope/list",
    method: "GET",
    transport: "auto",
    payload: (agentKey) => ({ agentKey }),
  }),
  modelOptions: defineEndpoint({
    key: "model.options",
    path: "/api/model-options",
    method: "GET",
    transport: "auto",
    cache: { ttlMs: 60_000, dedupe: true },
    payload: (agentKey?: string) =>
      compactPayload({ agentKey: String(agentKey || "").trim() }),
  }),
  query: defineEndpoint<QueryStreamParams>({
    key: "runs.query",
    path: "/api/query",
    method: "POST",
    transport: "sse",
    payload: buildQueryPayload,
  }),
  read: defineEndpoint({
    key: "chat.read",
    path: "/api/read",
    method: "POST",
    transport: "auto",
  }),
  remember: defineEndpoint({
    key: "chat.remember",
    path: "/api/remember",
    method: "POST",
    transport: "auto",
  }),
  resource: defineEndpoint<{ file: string }, { file: string }>({
    key: "resource.read",
    path: "/api/resource",
    method: "GET",
    transport: "resource",
    payload: ({ file }) => ({ file }),
  }),
  search: defineEndpoint({
    key: "global.search",
    path: "/api/search",
    method: "POST",
    transport: "auto",
  }),
  steer: defineEndpoint({
    key: "runs.steer",
    path: "/api/steer",
    method: "POST",
    transport: "auto",
  }),
  submit: defineEndpoint({
    key: "runs.submit",
    path: "/api/submit",
    method: "POST",
    transport: "auto",
  }),
  teams: defineEndpoint({
    key: "teams.list",
    path: "/api/teams",
    method: "GET",
    transport: "auto",
    cache: { ttlMs: 30_000, dedupe: true },
  }),
  terminalClose: defineEndpoint({
    key: "terminal.close",
    path: "/api/terminal/close",
    method: "POST",
    transport: "ws",
  }),
  terminalDetach: defineEndpoint({
    key: "terminal.detach",
    path: "/api/terminal/detach",
    method: "POST",
    transport: "ws",
  }),
  terminalInput: defineEndpoint({
    key: "terminal.input",
    path: "/api/terminal/input",
    method: "POST",
    transport: "ws",
  }),
  terminalOpen: defineEndpoint({
    key: "terminal.open",
    path: "/api/terminal/open",
    method: "POST",
    transport: "ws-stream",
  }),
  terminalResize: defineEndpoint({
    key: "terminal.resize",
    path: "/api/terminal/resize",
    method: "POST",
    transport: "ws",
  }),
  terminalStatus: defineEndpoint({
    key: "terminal.status",
    path: "/api/terminal/status",
    method: "POST",
    transport: "ws-stream",
  }),
  terminalStatusDetach: defineEndpoint({
    key: "terminal.status.detach",
    path: "/api/terminal/status/detach",
    method: "POST",
    transport: "ws",
  }),
  upload: defineEndpoint({
    key: "upload.file",
    path: "/api/upload",
    method: "POST",
    transport: "http",
  }),
  viewport: defineEndpoint<string, { viewportKey: string }>({
    key: "viewport.detail",
    path: "/api/viewport",
    method: "GET",
    transport: "auto",
    payload: (viewportKey) => ({ viewportKey }),
  }),
  voiceCapabilities: defineEndpoint({
    key: "voice.capabilities",
    path: "/api/voice/capabilities",
    method: "GET",
    transport: "http",
  }),
  voiceVoices: defineEndpoint({
    key: "voice.voices",
    path: "/api/voice/tts/voices",
    method: "GET",
    transport: "http",
  }),
  voiceWs: defineEndpoint({
    key: "voice.ws",
    path: "/api/voice/ws",
    method: "GET",
    transport: "voice-ws",
  }),
});

export type DataEndpointKey = keyof typeof dataEndpoints;

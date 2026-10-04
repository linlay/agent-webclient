import {
  getProjectGit as getProjectGitHttp,
  getProjectGitBranches as getProjectGitBranchesHttp,
  changeProjectGitBranch as changeProjectGitBranchHttp,
} from "@/shared/data/api/requests/projects";
import type { ProjectGitBranchRequest } from "@/shared/data/api/dto/resources";
import type { ConnectorOrderResponse, UpdateConnectorOrderRequest } from "@/shared/data/api/dto/connectors";
import {
  getConnectorOrder as getConnectorOrderHttp,
  putConnectorOrder as putConnectorOrderHttp,
} from "@/shared/data/api/requests/connectors";
import { buildResourceUrl } from "@/shared/data/api/resources/urls";
import {
  archiveChats as archiveChatsHttp,
  deleteArchive as deleteArchiveHttp,
  getArchive as getArchiveHttp,
  getArchives as getArchivesHttp,
  searchArchives as searchArchivesHttp,
  restoreArchives as restoreArchivesHttp,
} from "@/shared/data/api/requests/archives";
import {
  createAgent as createAgentHttp,
  deleteAgent as deleteAgentHttp,
  getAgent as getAgentHttp,
  getAgentSkills as getAgentSkillsHttp,
  getAgentOrder as getAgentOrderHttp,
  getAgents as getAgentsHttp,
  getModelOptions as getModelOptionsHttp,
  getTeams as getTeamsHttp,
  openAgentDirectory as openAgentDirectoryHttp,
  updateAgent as updateAgentHttp,
  updateAgentName as updateAgentNameHttp,
  updateAgentModelConfig as updateAgentModelConfigHttp,
  putAgentOrder as putAgentOrderHttp,
} from "@/shared/data/api/requests/agents";
import {
  deriveChat as deriveChatHttp,
  deleteChat as deleteChatHttp,
  searchGlobal as searchGlobalHttp,
  getChat as getChatHttp,
  getChatSystemPrompt as getChatSystemPromptHttp,
  getChats as getChatsHttp,
  getChatOrder as getChatOrderHttp,
  putChatOrder as putChatOrderHttp,
  normalizeChatSummariesPayload,
  getViewport as getViewportHttp,
  compactChat as compactChatHttp,
  markChatRead as markChatReadHttp,
  renameChat as renameChatHttp,
  submitFeedback as submitFeedbackHttp,
} from "@/shared/data/api/requests/chats";
import {
  downloadResource,
  downloadChatExport,
  getChatLLMTraceRaw as getChatLLMTraceRawHttp,
  getChatRawJsonl as getChatRawJsonlHttp,
  getResourceText,
} from "@/shared/data/api/resources";
import { ensureAccessToken, getCurrentAccessToken, setAccessToken } from "@/shared/data/api/http";
import { getAgentFile as getAgentFileHttp } from "@/shared/data/api/requests/projects";
import { getView as getViewHttp } from "@/shared/data/api/requests/views";
import { uploadFile } from "@/shared/data/api/requests/uploads";
import type {
	AgentDetailResponse,
	AgentSkillsResponse,
	AgentModelConfigResponse,
	AgentOrderResponse,
	CreateAgentRequest,
	DeleteAgentRequest,
	DeleteAgentResponse,
	GetAgentsOptions,
	OpenAgentDirectoryRequest,
	OpenAgentDirectoryResponse,
	UpdateAgentRequest,
	UpdateAgentNameRequest,
	UpdateAgentModelConfigRequest,
	UpdateAgentOrderRequest,
} from "@/shared/data/api/dto/agents";
import type {
	AgentFileRequest,
	AgentFileResponse,
} from "@/shared/data/api/dto/resources";
import type { ApiResponse } from "@/shared/data/api/dto/common";
import type { UpdateAgentSkillPinRequest } from "@/shared/data/api/dto/skills";
import { putAgentSkillPin as putAgentSkillPinHttp } from "@/shared/data/api/requests/skills";
import type {
	CompactChatResponse,
	CompactLevel,
} from "@/shared/data/api/dto/commands";
import type {
	ArchiveChatsRequest,
	ArchiveChatsResponse,
	ArchiveDeleteResponse,
	ArchiveDetailResponse,
	ArchivesRequest,
	ArchivesResponse,
	ArchiveSearchParams,
	ArchiveSearchResponse,
	ArchiveRestoreResponse,
} from "@/shared/data/api/dto/archives";
import type {
	ChatDetailResponse,
	ChatOrderResponse,
	ChatOrderSnapshotResponse,
	UpdateChatOrderRequest,
	ChatSystemPromptRequest,
	ChatSystemPromptResponse,
	DeriveChatRequest,
	DeriveChatResponse,
	FeedbackParams,
	GetChatsOptions,
	GlobalSearchParams,
	GlobalSearchResponse,
	MarkChatReadParams,
	RenameChatRequest,
	RenameChatResponse,
} from "@/shared/data/api/dto/chats";
import type {
	CoderModelOptionsResponse,
} from "@/shared/data/api/dto/models";

import {
	createDataCacheKey,
	resolveEndpointPayload,
	type EndpointDefinition,
} from "@/shared/data/api/endpointRegistry";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { dataQueryCache } from "@/shared/data/query/serverState";
import { getBackendMode } from "@/shared/config/backendMode";
import { requestDataThroughExecutor } from "@/shared/data/api/dataRequestExecutor";
import { getI18nRuntimeConfig } from "@/shared/i18n/runtime";

function emptyPayloadAsUndefined(payload: unknown): unknown {
	if (
		payload &&
		typeof payload === "object" &&
		!Array.isArray(payload) &&
		Object.keys(payload as Record<string, unknown>).length === 0
	) {
		return undefined;
	}
	return payload;
}

function createRouteCacheKey(
	endpoint: Pick<EndpointDefinition, "key">,
	payload: unknown,
): string {
	const localizedEndpoint = endpoint.key === dataEndpoints.agentSkills.key
		? { ...endpoint, key: `${endpoint.key}:${getI18nRuntimeConfig().locale}` }
		: endpoint;
	return `request:${createDataCacheKey(localizedEndpoint, payload)}`;
}

function createRouteCachePrefix(endpoint: Pick<EndpointDefinition, "key">): string {
	return `request:${endpoint.key}`;
}

function invalidateRouteEndpoints(
	...endpoints: Array<Pick<EndpointDefinition, "key">>
): void {
	for (const endpoint of endpoints) {
		dataQueryCache.invalidatePrefix(createRouteCachePrefix(endpoint));
		dataQueryCache.invalidatePrefix(`${endpoint.key}:`);
	}
}

function routeEndpoint<T, TInput>(
	endpoint: EndpointDefinition<TInput>,
	input: TInput,
	fallback: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
	const payload = emptyPayloadAsUndefined(resolveEndpointPayload(endpoint, input));
	const backend = getBackendMode();
	const useWebSocket = endpoint.transport === "ws"
		|| (
			endpoint.transport === "auto"
			&& endpoint.wsBackends?.includes(backend) === true
		);
	const request = useWebSocket
		? () => requestDataThroughExecutor<T>(endpoint.path, payload)
		: fallback;
	const cache = endpoint.method === "GET" ? endpoint.cache : undefined;
	if (!cache) {
		return request();
	}
	return dataQueryCache.fetch(
		createRouteCacheKey(endpoint, payload),
		request,
		{
			ttlMs: cache.ttlMs,
			dedupe: cache.dedupe,
		},
	);
}

export function getAgents(options: GetAgentsOptions = {}): Promise<ApiResponse> {
	return routeEndpoint(
		dataEndpoints.agents,
		options,
		() => getAgentsHttp(options),
	);
}

export function getAgentOrder(): Promise<ApiResponse<AgentOrderResponse>> {
	return routeEndpoint(dataEndpoints.agentOrder, undefined, () => getAgentOrderHttp());
}

export function putAgentOrder(
	params: UpdateAgentOrderRequest,
): Promise<ApiResponse<AgentOrderResponse>> {
	return routeEndpoint(dataEndpoints.agentOrderUpdate, params, () => putAgentOrderHttp(params))
		.then((response) => {
			invalidateRouteEndpoints(dataEndpoints.agents);
			return response;
		});
}

export function getAgent(agentKey: string): Promise<ApiResponse<AgentDetailResponse>> {
	return routeEndpoint(dataEndpoints.agent, agentKey, () => getAgentHttp(agentKey));
}

export function invalidateAgentDetail(agentKey?: string): void {
  if (agentKey) dataQueryCache.invalidate(createRouteCacheKey(dataEndpoints.agent, resolveEndpointPayload(dataEndpoints.agent, agentKey)));
  else invalidateRouteEndpoints(dataEndpoints.agent);
}

export function getAgentSkills(
	agentKey: string = "",
): Promise<ApiResponse<AgentSkillsResponse>> {
	return routeEndpoint(
		dataEndpoints.agentSkills,
		agentKey,
		() => getAgentSkillsHttp(agentKey),
	);
}

export function invalidateAgentSkills(agentKey: string): void {
	dataQueryCache.invalidate(createRouteCacheKey(
		dataEndpoints.agentSkills,
		resolveEndpointPayload(dataEndpoints.agentSkills, agentKey),
	));
}

export function putAgentSkillPin(params: UpdateAgentSkillPinRequest): Promise<ApiResponse<AgentSkillsResponse>> {
	return routeEndpoint<AgentSkillsResponse, UpdateAgentSkillPinRequest>(dataEndpoints.skillPinUpdate, params, () => putAgentSkillPinHttp(params))
    .then(response => {
      invalidateRouteEndpoints(dataEndpoints.agentSkills);
      return response;
    });
}

export function getAgentFile(
	params: AgentFileRequest,
): Promise<ApiResponse<AgentFileResponse>> {
	return routeEndpoint<AgentFileResponse, AgentFileRequest>(
		dataEndpoints.agentFile,
		params,
		() => getAgentFileHttp(params),
	);
}

export function createAgent(
	params: CreateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
	return createAgentHttp(params).then((response) => {
		invalidateRouteEndpoints(
			dataEndpoints.agent,
			dataEndpoints.agents,
			dataEndpoints.modelOptions,
		);
		return response;
	});
}

export function updateAgent(
	params: UpdateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
	return updateAgentHttp(params).then((response) => {
		invalidateRouteEndpoints(
			dataEndpoints.agent,
			dataEndpoints.agents,
			dataEndpoints.modelOptions,
		);
		return response;
	});
}

export function updateAgentName(
	params: UpdateAgentNameRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
	return updateAgentNameHttp(params).then((response) => {
		invalidateRouteEndpoints(
			dataEndpoints.agent,
			dataEndpoints.agents,
			dataEndpoints.modelOptions,
		);
		return response;
	});
}

export function updateAgentModelConfig(
	params: UpdateAgentModelConfigRequest,
): Promise<ApiResponse<AgentModelConfigResponse>> {
	return routeEndpoint<AgentModelConfigResponse, UpdateAgentModelConfigRequest>(
		dataEndpoints.agentModelConfig,
		params,
		() => updateAgentModelConfigHttp(params),
	).then((response) => {
		invalidateRouteEndpoints(
			dataEndpoints.agent,
			dataEndpoints.agents,
			dataEndpoints.modelOptions,
		);
		return response;
	});
}

export function deleteAgent(
	params: DeleteAgentRequest,
): Promise<ApiResponse<DeleteAgentResponse>> {
	return deleteAgentHttp(params).then((response) => {
		invalidateRouteEndpoints(
			dataEndpoints.agent,
			dataEndpoints.agents,
			dataEndpoints.chats,
			dataEndpoints.modelOptions,
		);
		return response;
	});
}

export function openAgentDirectory(
	params: OpenAgentDirectoryRequest,
): Promise<ApiResponse<OpenAgentDirectoryResponse>> {
	return openAgentDirectoryHttp(params);
}

export function getModelOptions(
	agentKey?: string,
	options: { force?: boolean } = {},
): Promise<ApiResponse<CoderModelOptionsResponse>> {
	if (options.force) {
		dataQueryCache.invalidate(createRouteCacheKey(
			dataEndpoints.modelOptions,
			resolveEndpointPayload(dataEndpoints.modelOptions, agentKey),
		));
	}
	return routeEndpoint<CoderModelOptionsResponse, string | undefined>(
		dataEndpoints.modelOptions,
		agentKey,
		() => getModelOptionsHttp(agentKey),
	);
}

export function getTeams(): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.teams, undefined, () => getTeamsHttp());
}

export async function getChats(options: GetChatsOptions = {}): Promise<ApiResponse> {
	const response = await routeEndpoint(
		dataEndpoints.chats,
		options,
		() => getChatsHttp(options),
	);
	return {
		...response,
		data: normalizeChatSummariesPayload(response.data),
	};
}

export function getChat(
	chatId: string,
	includeRawMessages = false,
): Promise<ApiResponse<ChatDetailResponse>> {
	return routeEndpoint(
		dataEndpoints.chat,
		{
			chatId,
			includeRawMessages,
		},
		() => getChatHttp(chatId, includeRawMessages),
	);
}

export function getChatSystemPrompt(
	params: ChatSystemPromptRequest,
): Promise<ApiResponse<ChatSystemPromptResponse>> {
	return routeEndpoint<ChatSystemPromptResponse, ChatSystemPromptRequest>(
		dataEndpoints.chatSystemPrompt,
		params,
		() => getChatSystemPromptHttp(params),
	);
}

export async function getChatRawJsonl(chatId: string): Promise<string> {
	const response = await routeEndpoint<string, { chatId: string }>(
		dataEndpoints.chatJsonl,
		{ chatId },
		async () => ({
			status: 200,
			code: 0,
			msg: "success",
			data: await getChatRawJsonlHttp(chatId),
		}),
	);
	return String(response.data ?? "");
}

function stringifyRawResponseData(data: unknown): string {
	if (typeof data === "string") {
		return data;
	}
	if (data === null || data === undefined) {
		return "";
	}
	if (typeof data === "object") {
		try {
			return JSON.stringify(data);
		} catch {
			return "";
		}
	}
	return String(data);
}

export async function getChatLLMTraceRaw(file: string): Promise<string> {
	const response = await routeEndpoint<string, { file: string }>(
		dataEndpoints.chatLlmTrace,
		{ file },
		async () => ({
			status: 200,
			code: 0,
			msg: "success",
			data: await getChatLLMTraceRawHttp(file),
		}),
	);
	return stringifyRawResponseData(response.data);
}

export function archiveChats(
	params: ArchiveChatsRequest,
): Promise<ApiResponse<ArchiveChatsResponse>> {
	return routeEndpoint<ArchiveChatsResponse, ArchiveChatsRequest>(
		dataEndpoints.chatArchive,
		params,
		() => archiveChatsHttp(params),
	).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function deriveChat(
	params: DeriveChatRequest,
): Promise<ApiResponse<DeriveChatResponse>> {
	return routeEndpoint<DeriveChatResponse, DeriveChatRequest>(
		dataEndpoints.chatDerive,
		params,
		() => deriveChatHttp(params),
	).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function getArchives(
	params: ArchivesRequest = {},
): Promise<ApiResponse<ArchivesResponse>> {
	return routeEndpoint<ArchivesResponse, ArchivesRequest>(
		dataEndpoints.archives,
		params,
		() => getArchivesHttp(params),
	);
}

export function getArchive(
	chatId: string,
	includeRawMessages = false,
): Promise<ApiResponse<ArchiveDetailResponse>> {
	return routeEndpoint<ArchiveDetailResponse, { chatId: string; includeRawMessages: boolean }>(
		dataEndpoints.archive,
		{
			chatId,
			includeRawMessages,
		},
		() => getArchiveHttp(chatId, includeRawMessages),
	);
}

export function searchArchives(
	params: ArchiveSearchParams,
): Promise<ApiResponse<ArchiveSearchResponse>> {
	return routeEndpoint<ArchiveSearchResponse, ArchiveSearchParams>(
		dataEndpoints.archivesSearch,
		params,
		() => searchArchivesHttp(params),
	);
}

export function deleteArchive(params: {
	chatId: string;
}): Promise<ApiResponse<ArchiveDeleteResponse>> {
	return routeEndpoint<ArchiveDeleteResponse, { chatId: string }>(
		dataEndpoints.archiveDelete,
		params,
		() => deleteArchiveHttp(params),
	).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function restoreArchives(params: {
	chatIds: string[];
}): Promise<ApiResponse<ArchiveRestoreResponse>> {
	return routeEndpoint<ArchiveRestoreResponse, { chatIds: string[] }>(
		dataEndpoints.archiveRestore,
		params,
		() => restoreArchivesHttp(params),
	).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function getView(params: import("@/shared/contracts/view").ViewRequest): Promise<ApiResponse<import("@/shared/contracts/view").ViewDocument>> {
  return routeEndpoint(dataEndpoints.view, params, () => getViewHttp(params));
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
	return routeEndpoint(
		dataEndpoints.viewport,
		viewportKey,
		() => getViewportHttp(viewportKey),
	);
}

// HTTP-only Automation methods share the raw client's function identities.
export {
  createAutomation,
  deleteAutomation,
  getAutomation,
  getAutomationExecution,
  getAutomationExecutions,
  getAutomations,
  toggleAutomation,
  triggerAutomation,
  updateAutomation,
} from "@/shared/data/api/requests/automations";

export function markChatRead(params: MarkChatReadParams): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.read, params, () => markChatReadHttp(params)).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function submitFeedback(params: FeedbackParams): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.feedback, params, () => submitFeedbackHttp(params));
}

export function deleteChat(params: { chatId: string }): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.chatDelete, params, () => deleteChatHttp(params)).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function renameChat(
	params: RenameChatRequest,
): Promise<ApiResponse<RenameChatResponse>> {
	return routeEndpoint<RenameChatResponse, RenameChatRequest>(
		dataEndpoints.chatRename,
		params,
		() => renameChatHttp(params),
	).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function searchGlobal(
	params: GlobalSearchParams,
): Promise<ApiResponse<GlobalSearchResponse>> {
	return routeEndpoint<GlobalSearchResponse, GlobalSearchParams>(
		dataEndpoints.search,
		params,
		() => searchGlobalHttp(params),
	);
}



export function compactChat(params: {
	requestId: string;
	chatId: string;
	level?: CompactLevel;
}): Promise<ApiResponse<CompactChatResponse>> {
	return routeEndpoint(dataEndpoints.compact, params, () => compactChatHttp(params)).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export {
	buildResourceUrl,
	downloadResource,
	downloadChatExport,
	ensureAccessToken,
	getCurrentAccessToken,
	getResourceText,
	setAccessToken,
	uploadFile,
};

export function getConnectorOrder(): Promise<ApiResponse<ConnectorOrderResponse>> {
	return routeEndpoint(dataEndpoints.connectorOrder, undefined, getConnectorOrderHttp);
}

export function putConnectorOrder(params: UpdateConnectorOrderRequest): Promise<ApiResponse<ConnectorOrderResponse>> {
	return routeEndpoint(dataEndpoints.connectorOrderUpdate, params, () => putConnectorOrderHttp(params));
}

export function invalidateChatNavigationCache(): void {
  invalidateRouteEndpoints(dataEndpoints.chats, dataEndpoints.agents);
}

export function getChatOrder(): Promise<ApiResponse<ChatOrderSnapshotResponse>> {
  return routeEndpoint(dataEndpoints.chatOrder, undefined, getChatOrderHttp);
}

export function putChatOrder(params: UpdateChatOrderRequest): Promise<ApiResponse<ChatOrderResponse>> {
  return routeEndpoint<ChatOrderResponse, UpdateChatOrderRequest>(
    dataEndpoints.chatOrderUpdate, params, () => putChatOrderHttp(params),
  ).then((response) => {
    invalidateChatNavigationCache();
    return response;
  });
}

// Git snapshots are cached by the composer domain, not the transport layer.
export function getProjectGit(agentKey: string, options: { signal?: AbortSignal } = {}) {
  return routeEndpoint(dataEndpoints.projectGit, { agentKey }, () => getProjectGitHttp(agentKey, options));
}

export function getProjectGitBranches(agentKey: string, options: { signal?: AbortSignal } = {}) {
  return routeEndpoint(dataEndpoints.projectGitBranches, { agentKey }, () => getProjectGitBranchesHttp(agentKey, options));
}

export function changeProjectGitBranch(request: ProjectGitBranchRequest) {
  // Never retry a dispatched mutation or fall back after a WS transport failure.
  return routeEndpoint(dataEndpoints.projectGitBranchChange, request, () => changeProjectGitBranchHttp(request));
}

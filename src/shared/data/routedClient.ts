import type { AIAwaitSubmitParamData } from "@/app/state/types";
import {
	buildResourceUrl,
	archiveChats as archiveChatsHttp,
	createAgent as createAgentHttp,
	createQueryStream,
	createAutomation as createAutomationHttp,
	deleteAgent as deleteAgentHttp,
	deleteArchive as deleteArchiveHttp,
	deleteChat as deleteChatHttp,
	deleteAutomation as deleteAutomationHttp,
	downloadResource,
	downloadChatExport,
	ensureAccessToken,
	getArchive as getArchiveHttp,
	getArchives as getArchivesHttp,
	searchGlobal as searchGlobalHttp,
	searchArchives as searchArchivesHttp,
	getAgent as getAgentHttp,
	getAgentOrder as getAgentOrderHttp,
	getAgents as getAgentsHttp,
	getChatLLMTraceRaw as getChatLLMTraceRawHttp,
	getChatRawJsonl as getChatRawJsonlHttp,
	getChat as getChatHttp,
	getChats as getChatsHttp,
	getCurrentAccessToken,
	getMemoryMeta as getMemoryMetaHttp,
	getMemoryRecord as getMemoryRecordHttp,
	getMemoryRecords as getMemoryRecordsHttp,
	getMemoryScope as getMemoryScopeHttp,
	getMemoryScopes as getMemoryScopesHttp,
	getModelOptions as getModelOptionsHttp,
	getAutomation as getAutomationHttp,
	getAutomationExecutions as getAutomationExecutionsHttp,
	getAutomations as getAutomationsHttp,
	normalizeChatSummariesPayload,
	previewMemoryContext as previewMemoryContextHttp,
	getResourceText,
	getTeams as getTeamsHttp,
	getViewport as getViewportHttp,
	compactChat as compactChatHttp,
	interruptChat as interruptChatHttp,
	learnChat as learnChatHttp,
	markChatRead as markChatReadHttp,
	openAgentWorkspace as openAgentWorkspaceHttp,
	rememberChat as rememberChatHttp,
	renameChat as renameChatHttp,
	restoreArchives as restoreArchivesHttp,
	saveMemoryScope as saveMemoryScopeHttp,
	setAccessToken,
	steerChat as steerChatHttp,
	submitFeedback as submitFeedbackHttp,
	submitAwaiting as submitAwaitingHttp,
	submitTool as submitToolHttp,
	toggleAutomation as toggleAutomationHttp,
	updateAgent as updateAgentHttp,
	updateAccessLevel as updateAccessLevelHttp,
	updateAgentModelConfig as updateAgentModelConfigHttp,
	putAgentOrder as putAgentOrderHttp,
	updateAutomation as updateAutomationHttp,
	uploadFile,
	validateMemoryScope as validateMemoryScopeHttp,
	type AgentDetailResponse,
	type AgentModelConfigResponse,
	type AgentOrderResponse,
	type AccessLevelUpdateParams,
	type AccessLevelUpdateResponse,
	type ApiResponse,
	type ArchiveChatsRequest,
	type ArchiveChatsResponse,
	type ArchiveDeleteResponse,
	type ArchiveDetailResponse,
	type ArchivesRequest,
	type ArchivesResponse,
	type ArchiveSearchParams,
	type ArchiveSearchResponse,
	type ArchiveRestoreResponse,
	type CreateAgentRequest,
	type CreateAutomationRequest,
	type DeleteAgentRequest,
	type DeleteAgentResponse,
	type DeleteAutomationRequest,
	type FeedbackParams,
	type GetAgentsOptions,
	type GetChatsOptions,
	type GetMemoryRecordsParams,
	type GlobalSearchParams,
	type GlobalSearchResponse,
	type MarkChatReadParams,
	type OpenAgentWorkspaceRequest,
	type OpenAgentWorkspaceResponse,
	type QueryLikeParams,
	type RenameChatRequest,
	type RenameChatResponse,
	type AutomationDetailResponse,
	type AutomationExecutionListResponse,
	type AutomationExecutionsRequest,
	type AutomationListRequest,
	type AutomationListResponse,
	type CoderModelOptionsResponse,
	type CompactChatResponse,
	type ToggleAutomationRequest,
	type UpdateAgentRequest,
	type UpdateAgentModelConfigRequest,
	type UpdateAgentOrderRequest,
	type UpdateAutomationRequest,
	} from "@/shared/data/client";
import type {
	MemoryContextPreviewResponse,
	MemoryMeta,
	MemoryRecordDetail,
	MemoryRecordsPayload,
	MemoryScopeDetail,
	MemoryScopeSavePayload,
	MemoryScopeSaveResult,
	MemoryScopesResponse,
	MemoryScopeValidationResult,
} from "@/shared/data/memoryTypes";
import {
	createTransportClient,
	type TransportRequestOptions,
} from "@/shared/data/transportClient";
import {
	createDataCacheKey,
	resolveEndpointPayload,
	type EndpointDefinition,
} from "@/shared/data/endpointRegistry";
import { dataEndpoints } from "@/shared/data/endpoints";
import { dataQueryCache } from "@/shared/data/serverState";
import type { TransportMode as TransportModeValue } from "@/features/transport/lib/transportMode";

let getTransportMode: () => TransportModeValue = () => "ws";
const transportClient = createTransportClient({
	getMode: () => getTransportMode(),
});

export function setTransportModeProvider(provider: () => TransportModeValue): void {
	getTransportMode = provider;
}

type RouteRequestOptions<T> = Omit<TransportRequestOptions<T>, "fallback">;

async function routeRequest<T>(
	type: string,
	payload: unknown,
	fallback: () => Promise<ApiResponse<T>>,
	options: RouteRequestOptions<T> = {},
): Promise<ApiResponse<T>> {
	return transportClient.request<T>(type, payload, {
		...options,
		fallback,
	});
}

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
	return `request:${createDataCacheKey(endpoint, payload)}`;
}

function createRouteCachePrefix(endpoint: Pick<EndpointDefinition, "key">): string {
	return `request:${endpoint.key}`;
}

function invalidateRouteEndpoints(
	...endpoints: Array<Pick<EndpointDefinition, "key">>
): void {
	for (const endpoint of endpoints) {
		dataQueryCache.invalidatePrefix(createRouteCachePrefix(endpoint));
	}
}

function routeEndpoint<T, TInput>(
	endpoint: EndpointDefinition<TInput>,
	input: TInput,
	fallback: () => Promise<ApiResponse<T>>,
	options: RouteRequestOptions<T> = {},
): Promise<ApiResponse<T>> {
	const payload = emptyPayloadAsUndefined(resolveEndpointPayload(endpoint, input));
	const request = () => {
		if (endpoint.transport !== "auto" && endpoint.transport !== "ws") {
			return fallback();
		}
		return routeRequest<T>(
			endpoint.path,
			payload,
			fallback,
			options,
		);
	};
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

export function getAgent(agentKey: string): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.agent, agentKey, () => getAgentHttp(agentKey));
}

export function createAgent(
	params: CreateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
	return createAgentHttp(params).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.agents, dataEndpoints.modelOptions);
		return response;
	});
}

export function updateAgent(
	params: UpdateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
	return updateAgentHttp(params).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.agents, dataEndpoints.modelOptions);
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
		invalidateRouteEndpoints(dataEndpoints.agents, dataEndpoints.modelOptions);
		return response;
	});
}

export function deleteAgent(
	params: DeleteAgentRequest,
): Promise<ApiResponse<DeleteAgentResponse>> {
	return deleteAgentHttp(params).then((response) => {
		invalidateRouteEndpoints(
			dataEndpoints.agents,
			dataEndpoints.chats,
			dataEndpoints.modelOptions,
		);
		return response;
	});
}

export function openAgentWorkspace(
	params: OpenAgentWorkspaceRequest,
): Promise<ApiResponse<OpenAgentWorkspaceResponse>> {
	return openAgentWorkspaceHttp(params);
}

export function getModelOptions(agentKey?: string): Promise<ApiResponse<CoderModelOptionsResponse>> {
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
): Promise<ApiResponse> {
	return routeEndpoint(
		dataEndpoints.chat,
		{
			chatId,
			includeRawMessages,
		},
		() => getChatHttp(chatId, includeRawMessages),
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
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
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
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
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
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
	).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
	return routeEndpoint(
		dataEndpoints.viewport,
		viewportKey,
		() => getViewportHttp(viewportKey),
	);
}

export function getAutomations(
	params: AutomationListRequest = {},
): Promise<ApiResponse<AutomationListResponse>> {
	return getAutomationsHttp(params);
}

export function getAutomation(
	id: string,
): Promise<ApiResponse<AutomationDetailResponse>> {
	return getAutomationHttp(id);
}

export function createAutomation(
	params: CreateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
	return createAutomationHttp(params);
}

export function updateAutomation(
	params: UpdateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
	return updateAutomationHttp(params);
}

export function deleteAutomation(
	params: DeleteAutomationRequest,
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
	return deleteAutomationHttp(params);
}

export function toggleAutomation(
	params: ToggleAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
	return toggleAutomationHttp(params);
}

export function getAutomationExecutions(
	params: AutomationExecutionsRequest,
): Promise<ApiResponse<AutomationExecutionListResponse>> {
	return getAutomationExecutionsHttp(params);
}

export function getMemoryRecords(
	params: GetMemoryRecordsParams,
): Promise<ApiResponse<MemoryRecordsPayload>> {
	return routeEndpoint<MemoryRecordsPayload, GetMemoryRecordsParams>(
		dataEndpoints.memoryRecords,
		params,
		() => getMemoryRecordsHttp(params),
	);
}

export function getMemoryRecord(
	agentKey: string | undefined,
	id: string,
): Promise<ApiResponse<MemoryRecordDetail>> {
	return routeEndpoint<MemoryRecordDetail, { agentKey?: string; recordId: string }>(
		dataEndpoints.memoryRecordDetail,
		{ agentKey, recordId: id },
		() => getMemoryRecordHttp(agentKey, id),
	);
}

export function getMemoryScopes(
	agentKey: string,
): Promise<ApiResponse<MemoryScopesResponse>> {
	return routeEndpoint<MemoryScopesResponse, string>(
		dataEndpoints.memoryScopes,
		agentKey,
		() => getMemoryScopesHttp(agentKey),
	);
}

export function getMemoryMeta(): Promise<ApiResponse<MemoryMeta>> {
	return routeEndpoint<MemoryMeta, undefined>(
		dataEndpoints.memoryMeta,
		undefined,
		() => getMemoryMetaHttp(),
	);
}

export function getMemoryScope(
	agentKey: string,
	scopeType: string,
	scopeKey?: string,
): Promise<ApiResponse<MemoryScopeDetail>> {
	return routeEndpoint<
		MemoryScopeDetail,
		{ agentKey: string; scopeType: string; scopeKey?: string }
	>(
		dataEndpoints.memoryScope,
		{ agentKey, scopeType, scopeKey },
		() => getMemoryScopeHttp(agentKey, scopeType, scopeKey),
	);
}

export function validateMemoryScope(
	agentKey: string,
	scopeType: string,
	markdown: string,
): Promise<ApiResponse<MemoryScopeValidationResult>> {
	return routeEndpoint<MemoryScopeValidationResult, Record<string, unknown>>(
		dataEndpoints.memoryScopeValidate,
		{ agentKey, scopeType, markdown },
		() => validateMemoryScopeHttp(agentKey, scopeType, markdown),
	);
}

export function previewMemoryContext(params: {
	chatId: string;
	message: string;
}): Promise<ApiResponse<MemoryContextPreviewResponse>> {
	return routeEndpoint<MemoryContextPreviewResponse, { chatId: string; message: string }>(
		dataEndpoints.memoryContextPreview,
		params,
		() => previewMemoryContextHttp(params),
	);
}

export function saveMemoryScope(
	payload: MemoryScopeSavePayload,
): Promise<ApiResponse<MemoryScopeSaveResult>> {
	return routeEndpoint<MemoryScopeSaveResult, MemoryScopeSavePayload>(
		dataEndpoints.memoryScopeSave,
		payload,
		() => saveMemoryScopeHttp(payload),
	).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.memoryMeta);
		return response;
	});
}

export function submitTool(params: {
	runId: string;
	agentKey: string;
	toolId: string;
	params: Record<string, unknown>;
}): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.submit, params, () => submitToolHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function submitAwaiting(params: {
	chatId?: string;
	runId: string;
	agentKey: string;
	awaitingId: string;
	submitId?: string;
	params: AIAwaitSubmitParamData[];
}): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.submit, params, () => submitAwaitingHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function markChatRead(params: MarkChatReadParams): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.read, params, () => markChatReadHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	}).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function submitFeedback(params: FeedbackParams): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.feedback, params, () => submitFeedbackHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function deleteChat(params: { chatId: string }): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.chatDelete, params, () => deleteChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	}).then((response) => {
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
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
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

export function interruptChat(params: QueryLikeParams): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.interrupt, params, () => interruptChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function updateAccessLevel(
	params: AccessLevelUpdateParams,
): Promise<ApiResponse<AccessLevelUpdateResponse>> {
	return routeEndpoint<AccessLevelUpdateResponse, AccessLevelUpdateParams>(
		dataEndpoints.accessLevelUpdate,
		params,
		() => updateAccessLevelHttp(params),
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
	);
}

export function steerChat(params: QueryLikeParams): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.steer, params, () => steerChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function rememberChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.remember, params, () => rememberChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	}).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function learnChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse> {
	return routeEndpoint(dataEndpoints.learn, params, () => learnChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	}).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export function compactChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse<CompactChatResponse>> {
	return routeEndpoint(dataEndpoints.compact, params, () => compactChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	}).then((response) => {
		invalidateRouteEndpoints(dataEndpoints.chats);
		return response;
	});
}

export {
	buildResourceUrl,
	createQueryStream,
	downloadResource,
	downloadChatExport,
	ensureAccessToken,
	getCurrentAccessToken,
	getResourceText,
	setAccessToken,
	uploadFile,
};

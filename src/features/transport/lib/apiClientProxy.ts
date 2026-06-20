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
} from "@/shared/api/apiClient";
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
} from "@/shared/api/memoryTypes";
import {
	createTransportClient,
	type TransportRequestOptions,
} from "@/features/transport/lib/transportClient";
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

function compactPayload(params: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(params).filter(
			([, value]) => value !== undefined && value !== null && value !== "",
		),
	);
}

export function getAgents(options: GetAgentsOptions = {}): Promise<ApiResponse> {
	const payload = compactPayload({ includeChats: options.includeChats, scope: options.scope });
	return routeRequest(
		"/api/agents",
		Object.keys(payload).length > 0 ? payload : undefined,
		() => getAgentsHttp(options),
	);
}

export function getAgentOrder(): Promise<ApiResponse<AgentOrderResponse>> {
	return routeRequest("/api/agents/order", undefined, () => getAgentOrderHttp());
}

export function putAgentOrder(
	params: UpdateAgentOrderRequest,
): Promise<ApiResponse<AgentOrderResponse>> {
	return routeRequest("/api/agents/order", params, () => putAgentOrderHttp(params));
}

export function getAgent(agentKey: string): Promise<ApiResponse> {
	return routeRequest("/api/agent", { agentKey }, () => getAgentHttp(agentKey));
}

export function createAgent(
	params: CreateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
	return createAgentHttp(params);
}

export function updateAgent(
	params: UpdateAgentRequest,
): Promise<ApiResponse<AgentDetailResponse>> {
	return updateAgentHttp(params);
}

export function updateAgentModelConfig(
	params: UpdateAgentModelConfigRequest,
): Promise<ApiResponse<AgentModelConfigResponse>> {
	return routeRequest<AgentModelConfigResponse>(
		"/api/agent/model-config",
		params,
		() => updateAgentModelConfigHttp(params),
	);
}

export function deleteAgent(
	params: DeleteAgentRequest,
): Promise<ApiResponse<DeleteAgentResponse>> {
	return deleteAgentHttp(params);
}

export function openAgentWorkspace(
	params: OpenAgentWorkspaceRequest,
): Promise<ApiResponse<OpenAgentWorkspaceResponse>> {
	return openAgentWorkspaceHttp(params);
}

export function getModelOptions(): Promise<ApiResponse<CoderModelOptionsResponse>> {
	return routeRequest<CoderModelOptionsResponse>(
		"/api/model-options",
		undefined,
		() => getModelOptionsHttp(),
	);
}

export function getTeams(): Promise<ApiResponse> {
	return routeRequest("/api/teams", undefined, () => getTeamsHttp());
}

export async function getChats(options: GetChatsOptions = {}): Promise<ApiResponse> {
	const payload = compactPayload({ agentKey: options.agentKey });
	const response = await routeRequest(
		"/api/chats",
		Object.keys(payload).length > 0 ? payload : undefined,
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
	return routeRequest(
		"/api/chat",
		compactPayload({
			chatId,
			includeRawMessages: includeRawMessages ? true : undefined,
		}),
		() => getChatHttp(chatId, includeRawMessages),
	);
}

export async function getChatRawJsonl(chatId: string): Promise<string> {
	const response = await routeRequest<string>(
		"/api/chat/jsonl",
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
	const response = await routeRequest<string>(
		"/api/chat/llm-trace",
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
	return routeRequest<ArchiveChatsResponse>(
		"/api/chat/archive",
		params,
		() => archiveChatsHttp(params),
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
	);
}

export function getArchives(
	params: ArchivesRequest = {},
): Promise<ApiResponse<ArchivesResponse>> {
	return routeRequest<ArchivesResponse>(
		"/api/archives",
		params,
		() => getArchivesHttp(params),
	);
}

export function getArchive(
	chatId: string,
	includeRawMessages = false,
): Promise<ApiResponse<ArchiveDetailResponse>> {
	return routeRequest<ArchiveDetailResponse>(
		"/api/archive",
		{
			chatId,
			...(includeRawMessages ? { includeRawMessages: true } : {}),
		},
		() => getArchiveHttp(chatId, includeRawMessages),
	);
}

export function searchArchives(
	params: ArchiveSearchParams,
): Promise<ApiResponse<ArchiveSearchResponse>> {
	return routeRequest<ArchiveSearchResponse>(
		"/api/archive/search",
		params,
		() => searchArchivesHttp(params),
	);
}

export function deleteArchive(params: {
	chatId: string;
}): Promise<ApiResponse<ArchiveDeleteResponse>> {
	return routeRequest<ArchiveDeleteResponse>(
		"/api/archive/delete",
		params,
		() => deleteArchiveHttp(params),
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
	);
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
	return routeRequest(
		"/api/viewport",
		{ viewportKey },
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
	return routeRequest<MemoryRecordsPayload>(
		"/api/memory/record/list",
		compactPayload(params as Record<string, unknown>),
		() => getMemoryRecordsHttp(params),
	);
}

export function getMemoryRecord(
	agentKey: string | undefined,
	id: string,
): Promise<ApiResponse<MemoryRecordDetail>> {
	return routeRequest<MemoryRecordDetail>(
		"/api/memory/record/detail",
		compactPayload({ agentKey, recordId: id }),
		() => getMemoryRecordHttp(agentKey, id),
	);
}

export function getMemoryScopes(
	agentKey: string,
): Promise<ApiResponse<MemoryScopesResponse>> {
	return routeRequest<MemoryScopesResponse>(
		"/api/memory/scope/list",
		compactPayload({ agentKey }),
		() => getMemoryScopesHttp(agentKey),
	);
}

export function getMemoryMeta(): Promise<ApiResponse<MemoryMeta>> {
	return routeRequest<MemoryMeta>(
		"/api/memory/meta",
		undefined,
		() => getMemoryMetaHttp(),
	);
}

export function getMemoryScope(
	agentKey: string,
	scopeType: string,
	scopeKey?: string,
): Promise<ApiResponse<MemoryScopeDetail>> {
	return routeRequest<MemoryScopeDetail>(
		"/api/memory/scope/detail",
		compactPayload({ agentKey, scopeType, scopeKey }),
		() => getMemoryScopeHttp(agentKey, scopeType, scopeKey),
	);
}

export function validateMemoryScope(
	agentKey: string,
	scopeType: string,
	markdown: string,
): Promise<ApiResponse<MemoryScopeValidationResult>> {
	return routeRequest<MemoryScopeValidationResult>(
		"/api/memory/scope/validate",
		{ agentKey, scopeType, markdown },
		() => validateMemoryScopeHttp(agentKey, scopeType, markdown),
	);
}

export function previewMemoryContext(params: {
	chatId: string;
	message: string;
}): Promise<ApiResponse<MemoryContextPreviewResponse>> {
	return routeRequest<MemoryContextPreviewResponse>(
		"/api/memory/context-preview",
		params,
		() => previewMemoryContextHttp(params),
	);
}

export function saveMemoryScope(
	payload: MemoryScopeSavePayload,
): Promise<ApiResponse<MemoryScopeSaveResult>> {
	return routeRequest<MemoryScopeSaveResult>(
		"/api/memory/scope/save",
		payload,
		() => saveMemoryScopeHttp(payload),
	);
}

export function submitTool(params: {
	runId: string;
	agentKey: string;
	toolId: string;
	params: Record<string, unknown>;
}): Promise<ApiResponse> {
	return routeRequest("/api/submit", params, () => submitToolHttp(params), {
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
	return routeRequest("/api/submit", params, () => submitAwaitingHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function markChatRead(params: MarkChatReadParams): Promise<ApiResponse> {
	return routeRequest("/api/read", params, () => markChatReadHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function submitFeedback(params: FeedbackParams): Promise<ApiResponse> {
	return routeRequest("/api/feedback", params, () => submitFeedbackHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function deleteChat(params: { chatId: string }): Promise<ApiResponse> {
	return routeRequest("/api/chat/delete", params, () => deleteChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function renameChat(
	params: RenameChatRequest,
): Promise<ApiResponse<RenameChatResponse>> {
	return routeRequest<RenameChatResponse>(
		"/api/chat/rename",
		params,
		() => renameChatHttp(params),
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
	);
}

export function searchGlobal(
	params: GlobalSearchParams,
): Promise<ApiResponse<GlobalSearchResponse>> {
	return routeRequest<GlobalSearchResponse>(
		"/api/search",
		params,
		() => searchGlobalHttp(params),
	);
}

export function interruptChat(params: QueryLikeParams): Promise<ApiResponse> {
	return routeRequest("/api/interrupt", params, () => interruptChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function updateAccessLevel(
	params: AccessLevelUpdateParams,
): Promise<ApiResponse<AccessLevelUpdateResponse>> {
	return routeRequest<AccessLevelUpdateResponse>(
		"/api/access-level",
		params,
		() => updateAccessLevelHttp(params),
		{
			fallbackOnConnectFailure: false,
			fallbackOnRequestFailure: false,
		},
	);
}

export function steerChat(params: QueryLikeParams): Promise<ApiResponse> {
	return routeRequest("/api/steer", params, () => steerChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function rememberChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse> {
	return routeRequest("/api/remember", params, () => rememberChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function learnChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse> {
	return routeRequest("/api/learn", params, () => learnChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function compactChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse<CompactChatResponse>> {
	return routeRequest("/api/compact", params, () => compactChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
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

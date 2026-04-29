import type { AIAwaitSubmitParamData } from "@/app/state/types";
import {
	buildResourceUrl,
	createQueryStream,
	createSchedule as createScheduleHttp,
	deleteChat as deleteChatHttp,
	deleteSchedule as deleteScheduleHttp,
	downloadResource,
	downloadChatExport,
	ensureAccessToken,
	searchGlobal as searchGlobalHttp,
	getAgent as getAgentHttp,
	getAgents as getAgentsHttp,
	getChat as getChatHttp,
	getChats as getChatsHttp,
	getCurrentAccessToken,
	getSchedule as getScheduleHttp,
	getScheduleExecutions as getScheduleExecutionsHttp,
	getSchedules as getSchedulesHttp,
	normalizeChatSummariesPayload,
	getResourceText,
	getSkills as getSkillsHttp,
	getTeams as getTeamsHttp,
	getTool as getToolHttp,
	getTools as getToolsHttp,
	getViewport as getViewportHttp,
	interruptChat as interruptChatHttp,
	learnChat as learnChatHttp,
	markChatRead as markChatReadHttp,
	rememberChat as rememberChatHttp,
	setAccessToken,
	steerChat as steerChatHttp,
	submitFeedback as submitFeedbackHttp,
	submitAwaiting as submitAwaitingHttp,
	submitTool as submitToolHttp,
	toggleSchedule as toggleScheduleHttp,
	updateSchedule as updateScheduleHttp,
	uploadFile,
	type ApiResponse,
	type CreateScheduleRequest,
	type DeleteScheduleRequest,
	type FeedbackParams,
	type GlobalSearchParams,
	type GlobalSearchResponse,
	type MarkChatReadParams,
	type QueryLikeParams,
	type ScheduleDetailResponse,
	type ScheduleExecutionListResponse,
	type ScheduleExecutionsRequest,
	type ScheduleListRequest,
	type ScheduleListResponse,
	type ToggleScheduleRequest,
	type UpdateScheduleRequest,
} from "@/shared/api/apiClient";
import {
	getWsClient,
	getWsClientAccessToken,
	initWsClient,
} from "@/features/transport/lib/wsClientSingleton";
import { isWsTransportError } from "@/features/transport/lib/wsClient";
import type { TransportMode as TransportModeValue } from "@/features/transport/lib/transportMode";

let getTransportMode: () => TransportModeValue = () => "ws";

export function setTransportModeProvider(provider: () => TransportModeValue): void {
	getTransportMode = provider;
}

async function routeRequest<T>(
	type: string,
	payload: unknown,
	fallback: () => Promise<ApiResponse<T>>,
	options: {
		fallbackOnConnectFailure?: boolean;
		fallbackOnRequestFailure?: boolean;
	} = {},
): Promise<ApiResponse<T>> {
	if (getTransportMode() !== "ws") {
		return fallback();
	}
	let accessToken = String(getCurrentAccessToken() || "").trim();
	if (!accessToken) {
		accessToken = String(await ensureAccessToken("missing")).trim();
	}

	const currentClient = getWsClient();
	const wsClient =
		currentClient == null || getWsClientAccessToken() !== accessToken
			? initWsClient({ accessToken })
			: currentClient;

	if (
		currentClient != null &&
		getWsClientAccessToken() === accessToken &&
		typeof wsClient.updateOptions === "function"
	) {
		wsClient.updateOptions({ accessToken });
	}

	try {
		await wsClient.connect();
	} catch (error) {
		if (options.fallbackOnConnectFailure === false) {
			throw error;
		}
		return fallback();
	}

	try {
		return await wsClient.request<T>({ type, payload });
	} catch (error) {
		if (
			options.fallbackOnRequestFailure === false
			|| !isWsTransportError(error)
		) {
			throw error;
		}
		return fallback();
	}
}

export function getAgents(): Promise<ApiResponse> {
	return routeRequest("/api/agents", undefined, () => getAgentsHttp());
}

export function getAgent(agentKey: string): Promise<ApiResponse> {
	return routeRequest("/api/agent", { agentKey }, () => getAgentHttp(agentKey));
}

export function getTeams(): Promise<ApiResponse> {
	return routeRequest("/api/teams", undefined, () => getTeamsHttp());
}

export function getSkills(tag?: string): Promise<ApiResponse> {
	return routeRequest("/api/skills", tag ? { tag } : undefined, () =>
		getSkillsHttp(tag),
	);
}

export function getTools(options: {
	tag?: string;
	kind?: string;
} = {}): Promise<ApiResponse> {
	return routeRequest(
		"/api/tools",
		{
			...(options.tag ? { tag: options.tag } : {}),
			...(options.kind ? { kind: options.kind } : {}),
		},
		() => getToolsHttp(options),
	);
}

export function getTool(toolName: string): Promise<ApiResponse> {
	return routeRequest("/api/tool", { toolName }, () => getToolHttp(toolName));
}

export async function getChats(): Promise<ApiResponse> {
	const response = await routeRequest("/api/chats", undefined, () => getChatsHttp());
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
		{
			chatId,
			...(includeRawMessages ? { includeRawMessages: true } : {}),
		},
		() => getChatHttp(chatId, includeRawMessages),
	);
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
	return routeRequest(
		"/api/viewport",
		{ viewportKey },
		() => getViewportHttp(viewportKey),
	);
}

export function getSchedules(
	params: ScheduleListRequest = {},
): Promise<ApiResponse<ScheduleListResponse>> {
	return routeRequest<ScheduleListResponse>(
		"/api/schedules",
		params,
		() => getSchedulesHttp(params),
	);
}

export function getSchedule(
	id: string,
): Promise<ApiResponse<ScheduleDetailResponse>> {
	return routeRequest<ScheduleDetailResponse>(
		"/api/schedule",
		{ id },
		() => getScheduleHttp(id),
	);
}

export function createSchedule(
	params: CreateScheduleRequest,
): Promise<ApiResponse<ScheduleDetailResponse>> {
	return routeRequest<ScheduleDetailResponse>(
		"/api/schedule-create",
		params,
		() => createScheduleHttp(params),
	);
}

export function updateSchedule(
	params: UpdateScheduleRequest,
): Promise<ApiResponse<ScheduleDetailResponse>> {
	return routeRequest<ScheduleDetailResponse>(
		"/api/schedule-update",
		params,
		() => updateScheduleHttp(params),
	);
}

export function deleteSchedule(
	params: DeleteScheduleRequest,
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
	return routeRequest<{ id: string; deleted: boolean }>(
		"/api/schedule-delete",
		params,
		() => deleteScheduleHttp(params),
	);
}

export function toggleSchedule(
	params: ToggleScheduleRequest,
): Promise<ApiResponse<ScheduleDetailResponse>> {
	return routeRequest<ScheduleDetailResponse>(
		"/api/schedule-toggle",
		params,
		() => toggleScheduleHttp(params),
	);
}

export function getScheduleExecutions(
	params: ScheduleExecutionsRequest,
): Promise<ApiResponse<ScheduleExecutionListResponse>> {
	return routeRequest<ScheduleExecutionListResponse>(
		"/api/schedule-executions",
		params,
		() => getScheduleExecutionsHttp(params),
	);
}

export function submitTool(params: {
	runId: string;
	toolId: string;
	params: Record<string, unknown>;
}): Promise<ApiResponse> {
	return routeRequest("/api/submit", params, () => submitToolHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
}

export function submitAwaiting(params: {
	runId: string;
	awaitingId: string;
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
	return routeRequest("/api/chat-delete", params, () => deleteChatHttp(params), {
		fallbackOnConnectFailure: false,
		fallbackOnRequestFailure: false,
	});
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

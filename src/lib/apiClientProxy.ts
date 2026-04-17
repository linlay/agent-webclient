import type { AIAwaitSubmitParamData } from "../context/types";
import type { TransportMode } from "./transportMode";
import {
	buildResourceUrl,
	createQueryStream,
	downloadResource,
	ensureAccessToken,
	getAgent as getAgentHttp,
	getAgents as getAgentsHttp,
	getChat as getChatHttp,
	getChats as getChatsHttp,
	getCurrentAccessToken,
	getResourceText,
	getSkills as getSkillsHttp,
	getTeams as getTeamsHttp,
	getTool as getToolHttp,
	getTools as getToolsHttp,
	getViewport as getViewportHttp,
	interruptChat as interruptChatHttp,
	learnChat as learnChatHttp,
	rememberChat as rememberChatHttp,
	setAccessToken,
	steerChat as steerChatHttp,
	submitAwaiting as submitAwaitingHttp,
	submitTool as submitToolHttp,
	uploadFile,
	type ApiResponse,
	type QueryLikeParams,
} from "./apiClient";
import { readStoredTransportMode } from "./transportMode";
import {
	getWsClient,
	getWsClientAccessToken,
	initWsClient,
} from "./wsClientSingleton";

let transportModeProvider: () => TransportMode = () =>
	readStoredTransportMode() || "ws";

export function setTransportModeProvider(provider: () => TransportMode): void {
	transportModeProvider = provider;
}

function shouldUseWsTransport(): boolean {
	try {
		return transportModeProvider() === "ws";
	} catch {
		return false;
	}
}

async function routeRequest<T>(
	type: string,
	payload: unknown,
	fallback: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
	if (!shouldUseWsTransport()) {
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

	if (currentClient != null && getWsClientAccessToken() === accessToken) {
		wsClient.updateOptions({ accessToken });
	}

	await wsClient.connect();
	return wsClient.request<T>({ type, payload });
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

export function getChats(): Promise<ApiResponse> {
	return routeRequest("/api/chats", undefined, () => getChatsHttp());
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

export function submitTool(params: {
	runId: string;
	toolId: string;
	params: Record<string, unknown>;
}): Promise<ApiResponse> {
	return routeRequest("/api/submit", params, () => submitToolHttp(params));
}

export function submitAwaiting(params: {
	runId: string;
	awaitingId: string;
	params: AIAwaitSubmitParamData[];
}): Promise<ApiResponse> {
	return routeRequest("/api/submit", params, () => submitAwaitingHttp(params));
}

export function interruptChat(params: QueryLikeParams): Promise<ApiResponse> {
	return routeRequest("/api/interrupt", params, () => interruptChatHttp(params));
}

export function steerChat(params: QueryLikeParams): Promise<ApiResponse> {
	return routeRequest("/api/steer", params, () => steerChatHttp(params));
}

export function rememberChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse> {
	return routeRequest("/api/remember", params, () => rememberChatHttp(params));
}

export function learnChat(params: {
	requestId: string;
	chatId: string;
}): Promise<ApiResponse> {
	return routeRequest("/api/learn", params, () => learnChatHttp(params));
}

export {
	buildResourceUrl,
	createQueryStream,
	downloadResource,
	ensureAccessToken,
	getCurrentAccessToken,
	getResourceText,
	setAccessToken,
	uploadFile,
};

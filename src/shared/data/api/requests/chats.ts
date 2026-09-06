import {
  isObjectRecord,
  requestJson,
  postJson,
} from "@/shared/data/api/http";
import type {
  GetChatsOptions,
  ChatDetailResponse,
  ChatSystemPromptRequest,
  ChatSystemPromptResponse,
  DeriveChatRequest,
  DeriveChatResponse,
  MarkChatReadParams,
  FeedbackParams,
  RenameChatRequest,
  RenameChatResponse,
  GlobalSearchParams,
  GlobalSearchResponse,
} from "@/shared/data/api/dto/chats";
import type { ApiResponse } from "@/shared/data/api/dto/common";
import type {
  BackgroundCommandParams,
  CompactChatParams,
  CompactChatResponse,
} from "@/shared/data/api/dto/commands";
import {
  endpointQuery,
  withQuery,
  toQueryString,
} from "@/shared/data/api/queryParams";
import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";

import {
  resolveEndpointPayload,
} from "@/shared/data/api/endpointRegistry";

export function normalizeChatSummariesPayload(data: unknown): unknown[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item) => {
    if (!isObjectRecord(item)) {
      return item;
    }

    const hasExplicitActiveRun = Object.prototype.hasOwnProperty.call(
      item,
      'hasActiveRun',
    );
    const hasActiveRunSummary = Object.prototype.hasOwnProperty.call(
      item,
      'activeRun',
    );
    return {
      ...item,
      hasPendingAwaiting: Object.prototype.hasOwnProperty.call(item, 'hasPendingAwaiting')
        ? Boolean(item.hasPendingAwaiting)
        : Boolean(item.awaiting),
      ...(hasExplicitActiveRun || hasActiveRunSummary
        ? {
            hasActiveRun: hasExplicitActiveRun
              ? Boolean(item.hasActiveRun)
              : Boolean(item.activeRun),
          }
        : {}),
    };
  });
}

export function getChats(options: GetChatsOptions = {}): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.chats, options);
  return requestJson(withQuery(dataEndpoints.chats.path, query)).then((response) => ({
    ...response,
    data: normalizeChatSummariesPayload(response.data),
  }));
}

export function getChat(
  chatId: string,
  includeRawMessages = false,
): Promise<ApiResponse<ChatDetailResponse>> {
  const query = endpointQuery(dataEndpoints.chat, { chatId, includeRawMessages });
	return requestJson(withQuery(dataEndpoints.chat.path, query));
}

export function getChatSystemPrompt(
  params: ChatSystemPromptRequest,
): Promise<ApiResponse<ChatSystemPromptResponse>> {
  const query = endpointQuery(dataEndpoints.chatSystemPrompt, params);
  return requestJson<ChatSystemPromptResponse>(
    withQuery(dataEndpoints.chatSystemPrompt.path, query),
  );
}

export function deriveChat(
  params: DeriveChatRequest,
): Promise<ApiResponse<DeriveChatResponse>> {
  return postJson<DeriveChatResponse>(dataEndpoints.chatDerive.path, {
    sourceChatId: params.sourceChatId,
    sourceRunId: params.sourceRunId,
    chatId: params.chatId,
    chatName: params.chatName,
  });
}

export function getViewport(viewportKey: string): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.viewport, viewportKey);
  return requestJson(withQuery(dataEndpoints.viewport.path, query));
}

export function markChatRead(params: MarkChatReadParams): Promise<ApiResponse> {
  return requestJson(dataEndpoints.read.path, {
    method: "POST",
    body: JSON.stringify({
      chatId: params.chatId,
      runId: params.runId,
      agentKey: params.agentKey,
    }),
  });
}

export function submitFeedback(params: FeedbackParams): Promise<ApiResponse> {
  return requestJson(dataEndpoints.feedback.path, {
    method: "POST",
    body: JSON.stringify({
      chatId: params.chatId,
      runId: params.runId,
      type: params.type,
      comment: params.comment,
    }),
  });
}

export function deleteChat(params: { chatId: string }): Promise<ApiResponse> {
  const query = endpointQuery(dataEndpoints.chatDelete, params);
  return requestJson(withQuery(dataEndpoints.chatDelete.path, query), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function renameChat(
  params: RenameChatRequest,
): Promise<ApiResponse<RenameChatResponse>> {
  const query = toQueryString({ chatId: params.chatId });
  return requestJson<RenameChatResponse>(withQuery(dataEndpoints.chatRename.path, query), {
    method: "POST",
    body: JSON.stringify({ chatName: params.chatName }),
  });
}

export function searchGlobal(
  params: GlobalSearchParams,
): Promise<ApiResponse<GlobalSearchResponse>> {
  return requestJson(dataEndpoints.search.path, {
    method: "POST",
    body: JSON.stringify({
      query: params.query,
      agentKey: params.agentKey,
      teamId: params.teamId,
      limit: params.limit,
    }),
  }) as Promise<ApiResponse<GlobalSearchResponse>>;
}

export function rememberChat(
  params: BackgroundCommandParams,
): Promise<ApiResponse> {
  return requestJson(dataEndpoints.remember.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
    }),
  });
}

export function learnChat(
  params: BackgroundCommandParams,
): Promise<ApiResponse> {
  return requestJson(dataEndpoints.learn.path, {
    method: "POST",
    body: JSON.stringify({
      requestId: params.requestId,
      chatId: params.chatId,
    }),
  });
}

export function compactChat(
  params: CompactChatParams,
): Promise<ApiResponse<CompactChatResponse>> {
  return requestJson(dataEndpoints.compact.path, {
    method: "POST",
    body: JSON.stringify(resolveEndpointPayload(dataEndpoints.compact, params)),
  });
}

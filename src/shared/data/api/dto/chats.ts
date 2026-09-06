export interface GetChatsOptions {
  agentKey?: string;
  mode?: string;
}

export interface DeriveChatRequest {
  sourceChatId: string;
  sourceRunId?: string;
  chatId?: string;
  chatName?: string;
}

export interface DeriveChatResponse {
  chatId: string;
  chatName: string;
  agentKey: string;
  teamId: string;
  sourceChatId: string;
  sourceRunId: string;
  lastRunId: string;
  copiedRuns: number;
  createdAt: number;
  updatedAt: number;
}

export interface RenameChatRequest {
  chatId: string;
  chatName: string;
}

export interface RenameChatResponse {
  chatId: string;
  chatName: string;
  updated: boolean;
}

export interface ChatUsageTokenDetails {
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  reasoningTokens?: number;
}

export interface ChatUsageEstimatedCost {
  currency?: string;
  inputCacheHit?: number;
  inputCacheMiss?: number;
  output?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ChatUsageTiming {
  firstTokenLatencyMs?: number;
  firstTokenLatencyTotalMs?: number;
  firstTokenLatencyCount?: number;
  generationDurationMs?: number;
}

export interface ChatUsageData {
  modelKey?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptTokensDetails?: ChatUsageTokenDetails;
  completionTokensDetails?: ChatUsageTokenDetails;
  estimatedCost?: ChatUsageEstimatedCost;
  timing?: ChatUsageTiming;
  llmChatCompletionCount?: number;
  toolCallCount?: number;
  current?: ChatUsageData;
  run?: ChatUsageData;
  lastRun?: ChatUsageData;
  chat?: ChatUsageData;
}

export interface ActiveRunInfo {
  runId?: string;
  agentKey?: string;
  teamId?: string;
  lastSeq?: number | string;
  planningMode?: boolean;
  editingMode?: boolean;
  [key: string]: unknown;
}

export interface ChatSummaryResponse {
  chatId: string;
  chatName?: string;
  agentKey?: string;
  teamId?: string;
  source?: string;
  createdAt?: number;
  updatedAt?: number;
  lastRunId?: string;
  lastRunContent?: string;
  read?: {
    isRead?: boolean;
    readAt?: number;
    readRunId?: string;
  };
  activeRun?: ActiveRunInfo | null;
  hasActiveRun?: boolean;
  awaiting?: Record<string, unknown> | null;
  hasPendingAwaiting?: boolean;
  usage?: ChatUsageData;
}

export interface ChatDetailResponse extends ChatSummaryResponse {
  firstAgentKey?: string;
  firstAgentName?: string;
  activeRun?: ActiveRunInfo | null;
  awaiting?: Record<string, unknown> | null;
  events?: unknown[];
  runs?: unknown[];
  plan?: unknown;
  artifact?: unknown;
  usage?: ChatUsageData;
  resourceTicket?: string;
	[key: string]: unknown;
}

export interface ChatSystemPromptRequest {
  chatId: string;
  runId: string;
  agentKey: string;
}

export interface ChatSystemPromptResponse {
  chatId: string;
  runId: string;
  agentKey: string;
  systemRef: {
    agentKey: string;
    cacheKey: string;
    fingerprint: string;
  };
  systemMessage: Record<string, unknown>;
}

export interface MarkChatReadParams {
  chatId?: string;
  runId?: string;
  agentKey?: string;
}

export interface FeedbackParams {
  chatId: string;
  runId: string;
  type: "thumbs_down" | "clear" | string;
  comment?: string;
}

export interface GlobalSearchParams {
  query: string;
  agentKey?: string;
  teamId?: string;
  limit?: number;
}

export interface GlobalSearchResult {
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
  runId?: string;
  kind: string;
  role?: string;
  timestamp: number;
  snippet: string;
  score: number;
}

export interface GlobalSearchResponse {
  query: string;
  count: number;
  results: GlobalSearchResult[];
}

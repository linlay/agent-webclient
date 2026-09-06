import type {
  ChatUsageData,
  ChatSummaryResponse,
} from "@/shared/data/api/dto/chats";

export interface ArchiveChatsRequest {
  chatIds: string[];
}

export interface ArchiveChatResult {
  chatId: string;
  success: boolean;
  error?: string;
}

export interface ArchiveChatsResponse {
  results: ArchiveChatResult[];
}

export interface ArchivesRequest {
  agentKey?: string;
  limit?: number;
  offset?: number;
}

export interface ArchivedSummaryResponse {
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number;
  archivedAt: number;
  lastRunId?: string;
  lastRunContent?: string;
  snippet?: string;
  hasAttachments?: boolean;
  usage?: ChatUsageData;
}

export interface ArchivesResponse {
  total: number;
  items: ArchivedSummaryResponse[];
}

export interface ArchiveSearchParams {
  query: string;
  agentKey?: string;
  limit?: number;
}

export interface ArchiveSearchResult {
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
  createdAt: number;
  updatedAt?: number;
  lastRunAt: number;
  lastRunId?: string;
  lastRunContent?: string;
  archivedAt: number;
  snippet: string;
  score: number;
  usage?: ChatUsageData;
}

export interface ArchiveSearchResponse {
  query: string;
  count: number;
  results: ArchiveSearchResult[];
}

export interface ArchiveDetailResponse {
  chatId: string;
  chatName?: string;
  createdAt?: number;
  updatedAt?: number;
  lastRunAt?: number;
  archivedAt?: number;
  events?: unknown[];
  rawMessages?: unknown[];
  runs?: unknown[];
  plan?: unknown;
  artifact?: unknown;
  usage?: ChatUsageData;
  resourceTicket?: string;
}

export interface ArchiveDeleteResponse {
  chatId: string;
  deleted: boolean;
}

export interface ArchiveRestoreResult {
  chatId: string;
  success: boolean;
  error?: string;
  summary?: ChatSummaryResponse;
}

export interface ArchiveRestoreResponse {
  results: ArchiveRestoreResult[];
}

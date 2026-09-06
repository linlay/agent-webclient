import type {
  RunOwner,
} from "@/shared/data/runOwner";
import type {
  QueryModelOverride,
} from "@/shared/data/api/dto/models";

export interface QueryLikeParams {
  requestId: string;
  chatId?: string;
  runId?: string;
  steerId?: string;
  owner: RunOwner;
  message: string;
  planningMode?: boolean;
}

export interface BTWInterruptResponse {
  accepted: boolean;
  status: string;
  runId: string;
  detail: string;
}

export type QueryAccessLevel = "default" | "auto_approve" | "full_access";

export interface AccessLevelUpdateParams {
  requestId: string;
  runId: string;
  owner: RunOwner;
  accessLevel: QueryAccessLevel;
  reason?: string;
}

export interface AccessLevelUpdateResponse {
  accepted: boolean;
  status: string;
  runId: string;
  previousAccessLevel?: QueryAccessLevel | string;
  accessLevel: QueryAccessLevel | string;
  version: number;
  detail: string;
}

export interface BackgroundCommandParams {
  requestId: string;
  chatId: string;
}

export type CompactLevel = "l1_tools" | "summary";

export interface CompactChatParams extends BackgroundCommandParams {
  level?: CompactLevel;
}

export interface CompactChatResponse {
  accepted: boolean;
  status: string;
  requestId?: string;
  chatId: string;
  compactId?: string;
  runId?: string;
  trigger?: string;
  scope?: "history" | "run";
  retryable?: boolean;
  level?: "summary" | "l1_tools";
  summarySource?: string;
  preCompactEstimatedTokens?: number;
  postCompactEstimatedTokens?: number;
  compressionRatio?: number;
  remainingRatio?: number;
  releasedRatio?: number;
  compactionUsage?: Record<string, unknown>;
  toolsCleared?: number;
  toolsKept?: number;
  tokensFreed?: number;
  detail?: string;
  // Legacy fields remain optional so archived compact events can still replay.
  boundaryRunId?: string;
  boundarySeq?: number;
  generation?: number;
  keptRunCount?: number;
  compactedRunCount?: number;
  toolDigestCount?: number;
  digestedRunIds?: string[];
  originalMessages?: number;
  projectedMessages?: number;
  cacheMetrics?: Record<string, unknown>;
  elapsedMs?: number;
}

export interface QueryStreamParams {
  requestId: string;
  message: string;
  planningMode?: boolean;
  editingMode?: boolean;
  mustUseSkills?: string[];
  agentMode?: string;
  accessLevel?: QueryAccessLevel;
  model?: QueryModelOverride;
  owner: RunOwner;
  chatId?: string;
  role?: string;
  hidden?: boolean;
  references?: unknown[];
  params?: Record<string, unknown>;
  scene?: string;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface BTWStreamParams {
  requestId: string;
  runId?: string;
  chatId: string;
  btwId?: string;
  message: string;
  accessLevel?: QueryAccessLevel;
  model?: QueryModelOverride;
  references?: unknown[];
  params?: Record<string, unknown>;
  scene?: QueryStreamParams["scene"];
  stream?: boolean;
  includeUsage?: boolean;
  includeFullText?: boolean;
  signal?: AbortSignal;
}

export interface AttachStreamParams {
  runId: string;
  owner: RunOwner;
  lastSeq?: number;
  signal?: AbortSignal;
}

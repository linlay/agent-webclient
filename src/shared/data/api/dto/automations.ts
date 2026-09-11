export interface AutomationListRequest {
  tag?: string;
}

export interface AutomationListResponse {
  items: AutomationSummaryResponse[];
  total: number;
  executionHistory: AutomationExecutionHistoryStatus;
}

export interface AutomationExecutionListResponse {
  items: AutomationExecutionResponse[];
  total: number;
}

export interface AutomationSummaryResponse {
  id: string;
  name: string;
  description?: string;
  cron: string;
  agentKey: string;
  enabled: boolean;
  teamId?: string;
  zoneId?: string;
  sourceFile?: string;
  remainingRuns?: number;
  nextFireAt?: number;
  nextFireTime?: string;
  lastExecution?: AutomationExecutionBrief;
}

export interface AutomationDetailResponse extends AutomationSummaryResponse {
  query: AutomationQueryResponse;
  executionHistory: AutomationExecutionHistoryStatus;
}

export type AutomationExecutionHistoryState =
  | "initializing"
  | "ready"
  | "degraded"
  | "unavailable";

export interface AutomationExecutionHistoryStatus {
  available: boolean;
  state: AutomationExecutionHistoryState;
  message?: string;
}

export type AutomationExecutionStatus =
  | "running"
  | "success"
  | "failed"
  | "canceled";

export interface AutomationQueryResponse {
  message: string;
  chatId?: string;
  role?: string;
  params?: Record<string, unknown>;
  hidden?: boolean;
}

export interface AutomationExecutionBrief {
  id: string;
  status: AutomationExecutionStatus;
  zoneId: string;
  chatId?: string;
  runId?: string;
  finishReason?: string;
  hasResult: boolean;
  resultPreview?: string;
  startedAt: number;
  startedTime?: string;
  runStartedAt?: number;
  completedAt?: number;
  completedTime?: string;
  durationMs?: number;
  error?: string;
}

export interface AutomationExecutionResponse {
  id: string;
  automationId: string;
  automationName: string;
  sourceFile: string;
  agentKey?: string;
  teamId?: string;
  status: AutomationExecutionStatus;
  error: string;
  zoneId: string;
  chatId?: string;
  runId?: string;
  finishReason?: string;
  hasResult: boolean;
  resultPreview?: string;
  startedAt: number;
  startedTime?: string;
  runStartedAt?: number;
  completedAt?: number;
  completedTime?: string;
  durationMs?: number;
}

export interface AutomationExecutionDetailResponse
  extends AutomationExecutionResponse {
  queryContent: string;
  resultContent: string;
}

export interface AutomationQueryRequest {
  message: string;
  chatId?: string;
  role?: string;
  params?: Record<string, unknown>;
  hidden?: boolean;
}

export interface CreateAutomationRequest {
  name: string;
  description?: string;
  cron: string;
  agentKey: string;
  enabled?: boolean;
  teamId?: string;
  zoneId?: string;
  remainingRuns?: number;
  query: AutomationQueryRequest;
}

export interface UpdateAutomationRequest {
  id: string;
  name?: string;
  description?: string;
  cron?: string;
  agentKey?: string;
  teamId?: string;
  zoneId?: string;
  enabled?: boolean;
  remainingRuns?: number;
  query?: AutomationQueryRequest;
}

export interface ToggleAutomationRequest {
  id: string;
  enabled: boolean;
}

export interface TriggerAutomationRequest {
  id: string;
}

export interface TriggerAutomationResponse {
  accepted: boolean;
  status: "accepted";
  automationId: string;
  executionId: string;
}

export interface DeleteAutomationRequest {
  id: string;
}

export interface AutomationExecutionsRequest {
  id: string;
  limit?: number;
  offset?: number;
}

export interface AutomationExecutionRequest {
  executionId: string;
}

export enum AIChatEventTypeEnum {
  Start = "chat.start",
  Update = "chat.update",
  Created = "chat.created",
  Updated = "chat.updated",
  Read = "chat.read",
  Unread = "chat.unread",
}

export enum AIRequestEventTypeEnum {
  Query = "request.query",
  Steer = "request.steer",
}

export enum AIRunEventTypeEnum {
  Start = "run.start",
  Cancel = "run.cancel",
  Complete = "run.complete",
  Error = "run.error",
}

export enum AIUsageEventTypeEnum {
  Snapshot = "usage.snapshot",
}

export enum AIContextEventTypeEnum {
  CompactComplete = "context.compact.complete",
  CompactFailed = "context.compact.failed",
  CompactStart = "context.compact.start",
}

export enum AIContentEventTypeEnum {
  Start = "content.start",
  Delta = "content.delta",
  Snapshot = "content.snapshot",
  End = "content.end",
}

export enum AIReasoningEventTypeEnum {
  Start = "reasoning.start",
  Delta = "reasoning.delta",
  End = "reasoning.end",
  Snapshot = "reasoning.snapshot",
}

export enum AIPlanningEventTypeEnum {
  Start = "planning.start",
  Delta = "planning.delta",
  End = "planning.end",
  Snapshot = "planning.snapshot",
}

export enum AIPlanEventTypeEnum {
  Create = "plan.create",
  Update = "plan.update",
}

export enum AITaskEventTypeEnum {
  Start = "task.start",
  Complete = "task.complete",
  Fail = "task.fail",
  Cancel = "task.cancel",
}

export enum AIToolEventTypeEnum {
  Start = "tool.start",
  Args = "tool.args",
  Snapshot = "tool.snapshot",
  End = "tool.end",
  Result = "tool.result",
}

export enum AIActionEventTypeEnum {
  Start = "action.start",
  Args = "action.args",
  End = "action.end",
  Result = "action.result",
  Snapshot = "action.snapshot",
}

export enum AIArtifactEventTypeEnum {
  Publish = "artifact.publish",
}

export const AWAITING_ASK_STREAM_EVENT_TYPE = "awaiting.ask";
export const AWAITING_ASK_PUSH_EVENT_TYPE = "awaiting.asking";
export const AWAITING_ANSWER_STREAM_EVENT_TYPE = "awaiting.answer";
export const AWAITING_ANSWER_PUSH_EVENT_TYPE = "awaiting.answered";
export const AWAITING_ANSWER_EVENT_TYPE = AWAITING_ANSWER_STREAM_EVENT_TYPE;

export enum AIAwaitEventTypeEnum {
  Ask = "awaiting.ask",
  Answer = "awaiting.answer",
}

export function isAwaitingAskStreamEvent(type: unknown): boolean {
  return String(type || "") === AWAITING_ASK_STREAM_EVENT_TYPE;
}

export function isAwaitingAskPushEvent(type: unknown): boolean {
  return String(type || "") === AWAITING_ASK_PUSH_EVENT_TYPE;
}

export function isAwaitingAskLike(type: unknown): boolean {
  return isAwaitingAskStreamEvent(type) || isAwaitingAskPushEvent(type);
}

export function isAwaitingAnswerStreamEvent(type: unknown): boolean {
  return String(type || "") === AWAITING_ANSWER_STREAM_EVENT_TYPE;
}

export function isAwaitingAnswerPushEvent(type: unknown): boolean {
  return String(type || "") === AWAITING_ANSWER_PUSH_EVENT_TYPE;
}

export function isAwaitingAnswerLike(type: unknown): boolean {
  return isAwaitingAnswerStreamEvent(type) || isAwaitingAnswerPushEvent(type);
}

export enum AIPlanStatusEnum {
  Init = "init",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Canceled = "canceled",
}

export enum ViewportTypeEnum {
  Builtin = "builtin",
  Qlc = "qlc",
  Html = "html",
}

export enum AIAwaitQuestionType {
  Text = "text",
  Number = "number",
  Select = "select",
  MultiSelect = "multi-select",
  Password = "password",
  Date = "date",
  DateTime = "datetime",
}

export type AIAwaitMode = "question" | "approval" | "form" | "plan";
export type AIAwaitApprovalDecision =
  | "approve"
  | "reject"
  | "approve_rule_run";
export type AIAwaitPlanDecision = "approve" | "reject";

export interface ResourceData {
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  sha256?: string;
  type?: string;
}

export interface ReferenceData extends ResourceData {
  id?: string;
  type?: string;
}

export interface AIPlan {
  taskId: string;
  description?: string;
  status?: AIPlanStatusEnum | string;
}

export interface AIUsageTokenDetails {
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  reasoningTokens?: number;
  [key: string]: unknown;
}

export interface AIUsageEstimatedCost {
  currency?: string;
  inputCacheHit?: number;
  inputCacheMiss?: number;
  output?: number;
  total?: number;
  [key: string]: unknown;
}

export interface AIUsageTiming {
  firstTokenLatencyMs?: number;
  firstTokenLatencyTotalMs?: number;
  firstTokenLatencyCount?: number;
  generationDurationMs?: number;
}

export interface AIUsageStats {
  modelKey?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptTokensDetails?: AIUsageTokenDetails;
  completionTokensDetails?: AIUsageTokenDetails;
  estimatedCost?: AIUsageEstimatedCost;
  timing?: AIUsageTiming;
  llmChatCompletionCount?: number;
  toolCallCount?: number;
  [key: string]: unknown;
}

export interface AIUsageSnapshotPayload {
  current?: AIUsageStats;
  run?: AIUsageStats;
  chat?: AIUsageStats;
  [key: string]: unknown;
}

export interface AIUsageContextWindow {
  maxSize?: number;
  currentSize?: number;
  estimatedNextCallSize?: number;
  modelKey?: string;
  reasoningEffort?: string;
  [key: string]: unknown;
}

export interface AIUsageModel {
  key?: string;
  [key: string]: unknown;
}

export interface AIAwaitQuestionOption {
  label: string;
  description?: string;
  previewHtml?: string;
  value?: string;
  recommended?: boolean;
}

export interface AIAwaitApprovalOption {
  label: string;
  description?: string;
  decision: string;
}

export interface AIAwaitPlanInput {
  type: "text";
  placeholder?: string;
  required?: boolean;
}

export interface AIAwaitPlanOption {
  label: string;
  description?: string;
  decision: AIAwaitPlanDecision;
  input?: AIAwaitPlanInput;
}

export interface AIAwaitQuestion {
  id: string;
  type: AIAwaitQuestionType;
  header?: string;
  question: string;
  placeholder?: string;
  options?: AIAwaitQuestionOption[];
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
}

export interface AIAwaitApproval {
  id: string;
  command: string;
  ruleKey?: string;
  description?: string;
  options?: AIAwaitApprovalOption[];
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
}

export interface AIAwaitForm {
  id: string;
  action?: string;
  form?: Record<string, unknown> | null;
  title?: string;
}

export interface AIAwaitPlan {
  id: string;
  planningId?: string;
  title?: string;
  options?: AIAwaitPlanOption[];
}

export interface AIAwaitQuestionSubmitParamData {
  id: string;
  answer?: string | number;
  answers?: string[];
}

export interface AIAwaitApprovalSubmitParamData {
  id: string;
  decision: AIAwaitApprovalDecision;
  reason?: string;
}

export type AIAwaitFormSubmitAction = "approve" | "reject";

export interface AIAwaitFormSubmitParamData {
  id: string;
  decision: AIAwaitFormSubmitAction;
  reason?: string;
  form?: Record<string, any> | null;
}

export interface AIAwaitPlanSubmitParamData {
  id?: string;
  decision: AIAwaitPlanDecision;
  reason?: string;
  planningId?: string;
}

export interface AIAwaitAnswerError {
  code: string;
  message: string;
}

export type AIAwaitSubmitParamData =
  | AIAwaitQuestionSubmitParamData
  | AIAwaitApprovalSubmitParamData
  | AIAwaitFormSubmitParamData
  | AIAwaitPlanSubmitParamData;

export interface AIAwaitSubmitPayloadData {
  params: AIAwaitSubmitParamData[];
  runId: string;
  awaitingId: string;
}

export interface AIEventCommonFields {
  seq?: number;
  chatId?: string;
  runId?: string;
  requestId?: string;
  steerId?: string;
  contentId?: string;
  reasoningId?: string;
  planningId?: string;
  toolId?: string;
  actionId?: string;
  planId?: string;
  taskId?: string;
  taskGroupId?: string;
  groupId?: string;
  agentKey?: string;
  subAgentKey?: string;
  message?: string;
  delta?: string;
  text?: string;
  error?: unknown;
  result?: unknown;
  approval?: Record<string, unknown>;
  output?: unknown;
  plan?: AIPlan[] | AIAwaitPlan | AIAwaitPlanSubmitParamData;
  arguments?: unknown;
  toolLabel?: string;
  toolName?: string;
  toolType?: string;
  toolKey?: string;
  viewportKey?: string;
  toolTimeout?: number | null;
  toolParams?: Record<string, unknown>;
  toolDescription?: string;
  actionParams?: Record<string, unknown>;
  description?: string;
  actionName?: string;
  references?: ReferenceData[];
  chatName?: string;
  firstAgentName?: string;
  taskName?: string;
  taskGroupTitle?: string;
  mainToolId?: string;
  awaitingId?: string;
  timeout?: number;
  viewportType?: ViewportTypeEnum;
  mode?: AIAwaitMode;
  payload?: Record<string, unknown> | null;
  questions?: AIAwaitQuestion[];
  rawEvent?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface AIBaseEvent extends AIEventCommonFields {
  rawEvent?: unknown;
  timestamp?: number;
}

interface AIBaseTaskEvent extends AIBaseEvent {
  runId?: string;
  taskId?: string;
}

export interface AIChatEvent extends AIBaseEvent {
  type: AIChatEventTypeEnum;
}

export interface AIRequestEvent extends AIBaseEvent {
  type: AIRequestEventTypeEnum;
}

export interface AIRunEvent extends AIBaseEvent {
  type: AIRunEventTypeEnum;
}

export interface AIUsageSnapshotEvent extends AIBaseEvent {
  type: AIUsageEventTypeEnum.Snapshot;
  model?: AIUsageModel;
  contextWindow?: AIUsageContextWindow;
  usage?: AIUsageSnapshotPayload;
}

export interface AIContextCompactEvent extends AIBaseEvent {
  type: AIContextEventTypeEnum;
  compactId?: string;
  summarySource?: string;
  generation?: number;
  toolDigestCount?: number;
  compactedRunCount?: number;
  digestedRunIds?: string[];
  originalMessages?: number;
  projectedMessages?: number;
  preCompactEstimatedTokens?: number;
  postCompactEstimatedTokens?: number;
  compressionRatio?: number;
  elapsedMs?: number;
  compactionUsage?: AIUsageStats;
  cacheMetrics?: Record<string, unknown>;
}

export interface AIContentEvent extends AIBaseTaskEvent {
  type: AIContentEventTypeEnum;
}

export interface AIReasoningEvent extends AIBaseTaskEvent {
  type: AIReasoningEventTypeEnum;
  reasoningLabel?: string;
}

export interface AIPlanningEvent extends AIBaseTaskEvent {
  type: AIPlanningEventTypeEnum;
  planningId?: string;
}

export interface AIPlanEvent extends AIBaseEvent {
  type: AIPlanEventTypeEnum;
  plan?: AIPlan[];
}

export interface AITaskEvent extends AIBaseTaskEvent {
  type: AITaskEventTypeEnum;
}

export interface AIToolEvent extends AIBaseTaskEvent {
  type: AIToolEventTypeEnum;
}

export interface AIActionEvent extends AIBaseTaskEvent {
  type: AIActionEventTypeEnum;
}

export interface AIArtifactEvent extends AIBaseEvent {
  type: AIArtifactEventTypeEnum;
  artifactCount?: number;
  artifacts?: Array<ResourceData & { artifactId?: string }>;
}

export interface AIAwaitAskEvent extends AIBaseEvent {
  type: AIAwaitEventTypeEnum.Ask;
  approvals?: AIAwaitApproval[];
  forms?: AIAwaitForm[];
  plan?: AIAwaitPlan;
}

export interface AIAwaitAnswerEvent extends AIBaseEvent {
  type: AIAwaitEventTypeEnum.Answer;
  status: "answered" | "error";
  answers?: AIAwaitQuestionSubmitParamData[];
  approvals?: AIAwaitApprovalSubmitParamData[];
  forms?: AIAwaitFormSubmitParamData[];
  plan?: AIAwaitPlanSubmitParamData;
  error?: AIAwaitAnswerError;
}

export type AIAwaitEvent =
  | AIAwaitAskEvent
  | AIAwaitAnswerEvent;

export type AIEvent =
  | AIChatEvent
  | AIRequestEvent
  | AIRunEvent
  | AIUsageSnapshotEvent
  | AIContextCompactEvent
  | AIContentEvent
  | AIReasoningEvent
  | AIPlanningEvent
  | AIPlanEvent
  | AITaskEvent
  | AIToolEvent
  | AIActionEvent
  | AIArtifactEvent
  | AIAwaitEvent;

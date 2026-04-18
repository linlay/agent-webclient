export enum AIChatEventTypeEnum {
  Start = 'chat.start',
  Update = 'chat.update',
}

export enum AIRequestEventTypeEnum {
  Query = 'request.query',
  Steer = 'request.steer',
}

export enum AIRunEventTypeEnum {
  Start = 'run.start',
  Cancel = 'run.cancel',
  Complete = 'run.complete',
  Error = 'run.error',
}

export enum AIContentEventTypeEnum {
  Start = 'content.start',
  Delta = 'content.delta',
  Snapshot = 'content.snapshot',
  End = 'content.end',
}

export enum AIReasoningEventTypeEnum {
  Start = 'reasoning.start',
  Delta = 'reasoning.delta',
  End = 'reasoning.end',
  Snapshot = 'reasoning.snapshot',
}

export enum AIPlanEventTypeEnum {
  Create = 'plan.create',
  Update = 'plan.update',
}

export enum AITaskEventTypeEnum {
  Start = 'task.start',
  Complete = 'task.complete',
  Fail = 'task.fail',
  Cancel = 'task.cancel',
}

export enum AIToolEventTypeEnum {
  Start = 'tool.start',
  Args = 'tool.args',
  Snapshot = 'tool.snapshot',
  End = 'tool.end',
  Result = 'tool.result',
}

export enum AIActionEventTypeEnum {
  Start = 'action.start',
  Args = 'action.args',
  End = 'action.end',
  Result = 'action.result',
  Snapshot = 'action.snapshot',
}

export enum AIArtifactEventTypeEnum {
  Publish = 'artifact.publish',
}

export enum AIAwaitEventTypeEnum {
  Ask = 'awaiting.ask',
  Payload = 'awaiting.payload',
  Answer = 'awaiting.answer',
}

export enum AIPlanStatusEnum {
  Init = 'init',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Canceled = 'canceled',
}

export enum ViewportTypeEnum {
  Builtin = 'builtin',
  Qlc = 'qlc',
  Html = 'html',
}

export enum AIAwaitQuestionType {
  Text = 'text',
  Number = 'number',
  Select = 'select',
  Password = 'password',
}

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

export interface AIAwaitQuestionOption {
  label: string;
  description?: string;
  value?: string;
}

export interface AIAwaitQuestion {
  type: AIAwaitQuestionType;
  header?: string;
  question: string;
  placeholder?: string;
  options?: AIAwaitQuestionOption[];
  multiSelect?: boolean;
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
}

export interface AIAwaitSubmitParamData {
  header?: string;
  question: string;
  answer?: string | number;
  answers?: string[];
}

export interface AIAwaitSubmitPayloadData {
  params: AIAwaitSubmitParamData[];
  runId: string;
  awaitingId: string;
}

export interface AIEventCommonFields {
  seq?: number;
  transportFrame?: 'stream' | 'push';
  chatId?: string;
  runId?: string;
  requestId?: string;
  steerId?: string;
  contentId?: string;
  reasoningId?: string;
  toolId?: string;
  actionId?: string;
  planId?: string;
  taskId?: string;
  agentKey?: string;
  message?: string;
  delta?: string;
  text?: string;
  error?: unknown;
  result?: unknown;
  output?: unknown;
  plan?: AIPlan[];
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
  awaitingId?: string;
  timeout?: number;
  viewportType?: ViewportTypeEnum;
  questions?: AIAwaitQuestion[];
  answers?: unknown;
  artifactId?: string;
  artifact?: ResourceData;
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

export interface AIContentEvent extends AIBaseTaskEvent {
  type: AIContentEventTypeEnum;
}

export interface AIReasoningEvent extends AIBaseTaskEvent {
  type: AIReasoningEventTypeEnum;
  reasoningLabel?: string;
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
  artifact?: ResourceData;
}

export interface AIAwaitAskEvent extends AIBaseEvent {
  type: AIAwaitEventTypeEnum.Ask;
}

export interface AIAwaitPayloadEvent extends AIBaseEvent {
  type: AIAwaitEventTypeEnum.Payload;
}
export interface AIAwaitAnswerEvent extends AIBaseEvent {
  type: AIAwaitEventTypeEnum.Answer;
  answers?: AIAwaitSubmitParamData[];
}

export type AIAwaitEvent = AIAwaitAskEvent | AIAwaitPayloadEvent | AIAwaitAnswerEvent;

export type AIEvent =
  | AIChatEvent
  | AIRequestEvent
  | AIRunEvent
  | AIContentEvent
  | AIReasoningEvent
  | AIPlanEvent
  | AITaskEvent
  | AIToolEvent
  | AIActionEvent
  | AIArtifactEvent
  | AIAwaitEvent;

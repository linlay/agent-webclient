import type {
  AccessLevelUpdateParams,
  AccessLevelUpdateResponse,
  ApiResponse,
  BTWStreamParams,
  QueryLikeParams,
  QueryStreamParams,
} from "@/shared/data/api/client";
import type { AIAwaitSubmitParamData, AgentEvent } from "@/app/state/types";
import type { RunOwner } from "@/shared/data/runOwner";

export type RealtimeTransportKind = "standalone" | "desktop";
export type RealtimeConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "disposed";

export type StatusListener = (status: RealtimeConnectionStatus) => void;

export interface RunIdentity {
  requestId: string;
  chatId: string;
  runId: string;
  owner: RunOwner;
  subscriptionId?: string;
  lastSeq?: number;
}

export interface RunCompletion {
  reason: string;
  lastSeq: number;
  error?: Error;
}

export interface RunExecution {
  identity: Promise<RunIdentity>;
  completion: Promise<RunCompletion>;
  detach(): Promise<void>;
}

export interface RunStartCallbacks {
  onEvent: (event: AgentEvent) => void;
}

export type StartQueryInput = Omit<QueryStreamParams, "signal"> &
  RunStartCallbacks & {
    /** Canonical hosts may supply a preallocated Run identity. */
    runId?: string;
    signal?: AbortSignal;
  };

export type StartBtwInput = Omit<BTWStreamParams, "signal"> &
  RunStartCallbacks & {
    owner: RunOwner;
    signal?: AbortSignal;
  };

export interface RunSubscribeInput extends RunStartCallbacks {
  requestId?: string;
  chatId: string;
  runId: string;
  owner: RunOwner;
  lastSeq?: number;
  role?: "main" | "overview" | "debug" | "btw";
  signal?: AbortSignal;
}

export interface AwaitingSubmitInput {
  chatId?: string;
  runId: string;
  owner: RunOwner;
  awaitingId: string;
  submitId?: string;
  params: AIAwaitSubmitParamData[];
}

export interface ToolSubmitInput {
  chatId?: string;
  runId: string;
  owner: RunOwner;
  toolId: string;
  params: Record<string, unknown>;
}

export interface RunTransport {
  startQuery(input: StartQueryInput): RunExecution;
  startBtw(input: StartBtwInput): RunExecution;
  subscribe(input: RunSubscribeInput): RunExecution;
  interrupt(input: QueryLikeParams): Promise<ApiResponse>;
  submitAwaiting(input: AwaitingSubmitInput): Promise<ApiResponse>;
  submitTool(input: ToolSubmitInput): Promise<ApiResponse>;
  steer(input: QueryLikeParams): Promise<ApiResponse>;
  updateAccessLevel(
    input: AccessLevelUpdateParams,
  ): Promise<ApiResponse<AccessLevelUpdateResponse>>;
}

export interface PushFrame {
  frame: "push";
  type?: string;
  payload?: unknown;
  data?: unknown;
  [key: string]: unknown;
}

export interface PushFilter {
  types: string[];
  chatId?: string;
  runId?: string;
  agentKey?: string;
}

export interface PushTransport {
  subscribe(filter: PushFilter, listener: (frame: PushFrame) => void): () => void;
}

export type InboundRequestHandler = (
  payload: unknown,
) => Promise<unknown> | unknown;

export interface InboundRequestTransport {
  register(type: string, handler: InboundRequestHandler): () => void;
}

export interface TerminalAccepted {
  requestId: string;
  terminalId: string;
  agentKey: string;
  terminalKey: string;
}

export interface TerminalCompletion {
  reason: string;
  lastSeq: number;
  error?: Error;
}

export interface TerminalExecution {
  accepted: Promise<TerminalAccepted>;
  completion: Promise<TerminalCompletion>;
  getTerminalId(): string;
  write(data: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  detach(): Promise<void>;
  close(): Promise<void>;
}

export interface TerminalOpenInput {
  agentKey: string;
  terminalKey: string;
  cols: number;
  rows: number;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export interface TerminalTransport {
  open(input: TerminalOpenInput): TerminalExecution;
  subscribeStatus(listener: (event: AgentEvent) => void): () => void;
}

export interface RealtimeTransport {
  readonly kind: RealtimeTransportKind;
  readonly runs: RunTransport;
  readonly push: PushTransport;
  readonly inbound?: InboundRequestTransport;
  readonly terminal: TerminalTransport;
  getStatus(): RealtimeConnectionStatus;
  subscribeStatus(listener: StatusListener): () => void;
  dispose(): Promise<void> | void;
}

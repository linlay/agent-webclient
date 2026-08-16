import type { AgentEvent } from "@/app/state/types";
import type {
  AgentWebclientBridgeAck,
  AgentWebclientBridgeResult,
  AgentWebclientRealtimeMessage,
  AgentWebclientRunControlKind,
  AgentWebclientRunOwner,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";
import type {
  AwaitingSubmitInput,
  RunAccepted,
  RunCompletion,
  RunExecution,
  RunSubscribeInput,
  RunTransport,
  StartBtwInput,
  StartQueryInput,
  ToolSubmitInput,
} from "@/features/transport/contracts/realtimeTransport";
import {
  fromDesktopBridgeError,
  RealtimeTransportError,
} from "@/features/transport/contracts/realtimeTransportErrors";
import { DesktopBridgeSession } from "@/features/transport/lib/desktopBridge";
import { buildQueryPayload } from "@/shared/data/api/endpoints";
import {
  ApiError,
  type AccessLevelUpdateParams,
  type AccessLevelUpdateResponse,
  type ApiResponse,
  type QueryLikeParams,
} from "@/shared/data/api/client";
import type { RunOwner } from "@/shared/data/runOwner";
import { createCompactId } from "@/shared/utils/compactId";

const EARLY_EVENT_LIMIT = 256;
const UNKNOWN_MESSAGE_LIMIT = 256;

type RunMessage = Extract<
  AgentWebclientRealtimeMessage,
  { kind: "run.batch" | "run.completed" | "error" }
>;

type RunContext = {
  kind: "query" | "subscription";
  requestId: string;
  chatId: string;
  runId: string;
  owner: RunOwner;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
  subscriptionId: string;
  bindingEpoch: number;
  lastSeq: number;
  acceptedSettled: boolean;
  completionSettled: boolean;
  detached: boolean;
  earlyEvents: AgentEvent[];
  resolveAccepted: (accepted: RunAccepted) => void;
  rejectAccepted: (error: unknown) => void;
  resolveCompletion: (completion: RunCompletion) => void;
  detach: () => Promise<void>;
};

function abortError(message = "The operation was detached."): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function toDesktopOwner(owner: RunOwner): AgentWebclientRunOwner {
  return owner.kind === "orchestrated-team"
    ? { kind: "team", teamId: owner.teamId }
    : { kind: "agent", agentKey: owner.agentKey };
}

function eventSeq(event: Record<string, unknown>): number {
  const seq = Number(event.seq ?? 0);
  return Number.isFinite(seq) && seq >= 0 ? seq : 0;
}

function failedExecution(error: Error): RunExecution {
  return {
    accepted: Promise.reject(error),
    completion: Promise.resolve({ reason: "error", lastSeq: 0, error }),
    detach: async () => undefined,
  };
}

function requireIdentity(chatId: unknown, runId: unknown): {
  chatId: string;
  runId: string;
} {
  const normalizedChatId = String(chatId || "").trim();
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedChatId || !normalizedRunId) {
    throw new RealtimeTransportError(
      "run_identity_missing",
      "Desktop realtime requires canonical chatId and runId",
    );
  }
  return { chatId: normalizedChatId, runId: normalizedRunId };
}

function fromDesktopOwner(owner: AgentWebclientRunOwner): RunOwner {
  return owner.kind === "team"
    ? { kind: "orchestrated-team", teamId: owner.teamId }
    : { kind: "agent", agentKey: owner.agentKey };
}

function normalizeControlResponse(
  response: AgentWebclientBridgeAck["response"],
): ApiResponse {
  if (!response) {
    throw new RealtimeTransportError(
      "protocol_error",
      "Desktop Bridge v2 did not return a Platform control response",
    );
  }
  const normalized: ApiResponse = {
    status: Number(response.status),
    code: Number(response.code),
    msg: String(response.msg || ""),
    data: response.data ?? null,
  };
  if (normalized.status >= 400) {
    throw new ApiError(normalized.msg || "Agent Platform control failed", {
      status: normalized.status,
      code: normalized.code,
      data: normalized.data,
    });
  }
  return normalized;
}

export class DesktopRunTransport implements RunTransport {
  private readonly operations = new Map<string, RunContext>();
  private readonly subscriptions = new Map<string, RunContext>();
  private readonly runChats = new Map<string, string>();
  private readonly pendingSubscriptions = new Set<RunContext>();
  private readonly unknownMessages = new Map<string, RunMessage[]>();
  private unknownMessageCount = 0;
  private readonly removeMessageListener: () => void;
  private disposed = false;

  constructor(private readonly session: DesktopBridgeSession) {
    this.removeMessageListener = session.subscribeMessages((message) => {
      this.handleMessage(message);
    });
  }

  private createContext(input: {
    kind: RunContext["kind"];
    requestId: string;
    chatId: string;
    runId: string;
    owner: RunOwner;
    lastSeq?: number;
    signal?: AbortSignal;
    onEvent: (event: AgentEvent) => void;
  }): { context: RunContext; execution: RunExecution } {
    let resolveAccepted!: (accepted: RunAccepted) => void;
    let rejectAccepted!: (error: unknown) => void;
    const accepted = new Promise<RunAccepted>((resolve, reject) => {
      resolveAccepted = resolve;
      rejectAccepted = reject;
    });
    let resolveCompletion!: (completion: RunCompletion) => void;
    const completion = new Promise<RunCompletion>((resolve) => {
      resolveCompletion = resolve;
    });
    const context: RunContext = {
      ...input,
      subscriptionId: "",
      bindingEpoch: -1,
      lastSeq: Math.max(0, Number(input.lastSeq) || 0),
      acceptedSettled: false,
      completionSettled: false,
      detached: false,
      earlyEvents: [],
      resolveAccepted,
      rejectAccepted,
      resolveCompletion,
      detach: async () => undefined,
    };
    context.detach = () => this.detachContext(context);
    if (input.signal) {
      if (input.signal.aborted) {
        void context.detach();
      } else {
        input.signal.addEventListener("abort", context.detach, { once: true });
      }
    }
    return {
      context,
      execution: { accepted, completion, detach: context.detach },
    };
  }

  private settleAccepted(context: RunContext): void {
    if (context.acceptedSettled || context.detached) return;
    context.acceptedSettled = true;
    context.resolveAccepted({
      requestId: context.requestId,
      chatId: context.chatId,
      runId: context.runId,
      owner: context.owner,
      ...(context.subscriptionId ? { subscriptionId: context.subscriptionId } : {}),
      lastSeq: context.lastSeq,
    });
    for (const event of context.earlyEvents.splice(0)) context.onEvent(event);
  }

  private cleanupContext(context: RunContext): void {
    context.signal?.removeEventListener("abort", context.detach);
    this.pendingSubscriptions.delete(context);
    if (this.operations.get(context.requestId) === context) {
      this.operations.delete(context.requestId);
    }
    if (
      context.subscriptionId &&
      this.subscriptions.get(context.subscriptionId) === context
    ) {
      this.subscriptions.delete(context.subscriptionId);
    }
  }

  private finishContext(
    context: RunContext,
    completion: RunCompletion,
  ): void {
    if (context.completionSettled) return;
    if (!context.acceptedSettled) {
      context.acceptedSettled = true;
      context.rejectAccepted(
        completion.error || new RealtimeTransportError(
          "protocol_error",
          "Run completed before it was accepted",
        ),
      );
    }
    context.completionSettled = true;
    this.cleanupContext(context);
    context.resolveCompletion(completion);
  }

  private failContext(context: RunContext, error: Error): void {
    this.finishContext(context, {
      reason: "error",
      lastSeq: context.lastSeq,
      error,
    });
  }

  private async detachContext(context: RunContext): Promise<void> {
    if (context.detached) return;
    context.detached = true;
    const subscriptionId = context.subscriptionId;
    this.cleanupContext(context);
    const target = context.kind === "query"
      ? { kind: "operation" as const, operationId: context.requestId }
      : subscriptionId
        ? { kind: "subscription" as const, subscriptionId }
        : null;
    if (target) {
      try {
        await this.session.realtime.detach({
          version: AGENT_WEBCLIENT_BRIDGE_VERSION,
          target,
        });
      } catch {
        // Local detach is authoritative for this observer.
      }
    }
    if (!context.acceptedSettled) {
      context.acceptedSettled = true;
      context.rejectAccepted(abortError());
    }
    if (!context.completionSettled) {
      context.completionSettled = true;
      context.resolveCompletion({ reason: "detached", lastSeq: context.lastSeq });
    }
  }

  private bufferUnknown(subscriptionId: string, message: RunMessage): void {
    if (!subscriptionId) return;
    if (this.unknownMessageCount >= UNKNOWN_MESSAGE_LIMIT) {
      const error = new RealtimeTransportError(
        "backpressure",
        "Desktop bridge emitted too many messages before subscription acknowledgement",
      );
      for (const context of Array.from(this.pendingSubscriptions)) {
        this.failContext(context, error);
      }
      this.unknownMessages.clear();
      this.unknownMessageCount = 0;
      return;
    }
    const messages = this.unknownMessages.get(subscriptionId) || [];
    messages.push(message);
    this.unknownMessages.set(subscriptionId, messages);
    this.unknownMessageCount += 1;
  }

  private drainUnknown(context: RunContext): void {
    const messages = this.unknownMessages.get(context.subscriptionId) || [];
    this.unknownMessages.delete(context.subscriptionId);
    this.unknownMessageCount = Math.max(0, this.unknownMessageCount - messages.length);
    for (const message of messages) this.dispatchToContext(context, message);
  }

  private deliverBatch(
    context: RunContext,
    message: Extract<AgentWebclientRealtimeMessage, { kind: "run.batch" }>,
  ): void {
    if (context.detached || context.completionSettled) return;
    if (context.kind === "query" && !context.runId) {
      if (context.chatId && message.chatId !== context.chatId) return;
      context.chatId = message.chatId;
      context.runId = message.runId;
    }
    if (message.chatId !== context.chatId || message.runId !== context.runId) return;
    if (message.bindingEpoch < context.bindingEpoch) return;
    context.bindingEpoch = Math.max(context.bindingEpoch, message.bindingEpoch);

    const deliverable: AgentEvent[] = [];
    for (const rawEvent of message.events) {
      const seq = eventSeq(rawEvent);
      if (seq > 0 && seq <= context.lastSeq) continue;
      if (seq > context.lastSeq + 1) {
        this.failContext(context, new RealtimeTransportError(
          "replay_required",
          `Run event gap detected after seq ${context.lastSeq}`,
          { retryable: true },
        ));
        void context.detach();
        return;
      }
      if (seq > 0) context.lastSeq = seq;
      deliverable.push(rawEvent as AgentEvent);
    }
    const advertisedLastSeq = Math.max(0, Number(message.lastSeq) || 0);
    if (advertisedLastSeq > context.lastSeq) {
      this.failContext(context, new RealtimeTransportError(
        "replay_required",
        `Run batch ended at seq ${advertisedLastSeq} after delivering ${context.lastSeq}`,
        { retryable: true },
      ));
      void context.detach();
      return;
    }
    if (!context.acceptedSettled) {
      context.earlyEvents.push(...deliverable);
      if (context.earlyEvents.length > EARLY_EVENT_LIMIT) {
        this.failContext(context, new RealtimeTransportError(
          "early_event_buffer_overflow",
          "Run emitted too many events before acceptance",
        ));
      }
      return;
    }
    for (const event of deliverable) context.onEvent(event);
  }

  private dispatchToContext(context: RunContext, message: RunMessage): void {
    if (message.kind === "run.batch") {
      this.deliverBatch(context, message);
      return;
    }
    if (message.kind === "run.completed") {
      if (message.chatId !== context.chatId || message.runId !== context.runId) return;
      context.lastSeq = Math.max(context.lastSeq, Number(message.lastSeq) || 0);
      this.finishContext(context, {
        reason: message.reason || "done",
        lastSeq: context.lastSeq,
      });
      return;
    }
    this.failContext(context, fromDesktopBridgeError(message.error));
  }

  private handleMessage(message: AgentWebclientRealtimeMessage): void {
    if (this.disposed) return;
    if (message.kind === "run.accepted") {
      const context = this.operations.get(message.operationId);
      if (!context || context.detached) return;
      if (
        (context.chatId && message.chatId !== context.chatId) ||
        (context.runId && message.runId !== context.runId)
      ) {
        this.failContext(context, new RealtimeTransportError(
          "protocol_error",
          "Desktop accepted identity conflicts with the pending query",
        ));
        return;
      }
      context.chatId = message.chatId;
      context.runId = message.runId;
      context.owner = fromDesktopOwner(message.owner);
      this.runChats.set(context.runId, context.chatId);
      this.settleAccepted(context);
      return;
    }
    if (message.kind !== "run.batch" && message.kind !== "run.completed" && message.kind !== "error") {
      return;
    }
    if (message.delivery.kind === "operation") {
      const operation = this.operations.get(message.delivery.operationId);
      if (operation) {
        this.dispatchToContext(operation, message);
      }
      return;
    }
    if (message.delivery.kind === "subscription") {
      const subscriptionId = message.delivery.subscriptionId;
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        this.dispatchToContext(subscription, message);
      } else {
        this.bufferUnknown(subscriptionId, message);
      }
    }
  }

  private requireBridgeAck(result: AgentWebclientBridgeResult): AgentWebclientBridgeAck {
    if (!result.ok) throw fromDesktopBridgeError(result.error);
    return result;
  }

  startQuery(input: StartQueryInput): RunExecution {
    if (this.disposed) {
      return failedExecution(new RealtimeTransportError(
        "transport_disposed",
        "Desktop realtime transport has been disposed",
      ));
    }
    const chatId = String(input.chatId || "").trim();
    const created = this.createContext({
      kind: "query",
      requestId: input.requestId,
      chatId,
      runId: "",
      owner: input.owner,
      signal: input.signal,
      onEvent: input.onEvent,
    });
    const { context } = created;
    if (context.detached) return created.execution;
    this.operations.set(context.requestId, context);
    void this.session.requireCapability("run.query")
      .then(() => {
        const {
          runId: _runId,
          ...payload
        } = buildQueryPayload(input);
        return this.session.realtime.request({
          version: AGENT_WEBCLIENT_BRIDGE_VERSION,
          operationId: context.requestId,
          kind: "run.query",
          ...(context.chatId ? { chatId: context.chatId } : {}),
          owner: toDesktopOwner(context.owner),
          payload,
        });
      })
      .then((result) => {
        const ack = this.requireBridgeAck(result);
        if (ack.operationId && ack.operationId !== context.requestId) {
          throw new RealtimeTransportError(
            "protocol_error",
            "Desktop bridge returned a mismatched operationId",
          );
        }
        if (ack.subscriptionId) {
          throw new RealtimeTransportError(
            "protocol_error",
            "Desktop Bridge v2 query acknowledgement must not return subscriptionId",
          );
        }
      })
      .catch((error) => this.failContext(
        context,
        error instanceof Error ? error : new Error(String(error)),
      ));
    return created.execution;
  }

  startBtw(_input: StartBtwInput): RunExecution {
    return failedExecution(new RealtimeTransportError(
      "unsupported_in_current_view",
      "Desktop Bridge v2 does not support BTW runs",
    ));
  }

  subscribe(input: RunSubscribeInput): RunExecution {
    if (input.role === "btw") {
      return failedExecution(new RealtimeTransportError(
        "unsupported_in_current_view",
        "Desktop Bridge v2 does not support BTW subscriptions",
      ));
    }
    let identity: { chatId: string; runId: string };
    try {
      identity = requireIdentity(input.chatId, input.runId);
    } catch (error) {
      return failedExecution(error as Error);
    }
    const created = this.createContext({
      kind: "subscription",
      requestId: input.requestId || createCompactId("desktop_attach"),
      ...identity,
      owner: input.owner,
      lastSeq: input.lastSeq,
      signal: input.signal,
      onEvent: input.onEvent,
    });
    const { context } = created;
    if (context.detached) return created.execution;
    this.pendingSubscriptions.add(context);
    const role = input.role === "overview"
      ? "summary"
      : input.role === "debug"
        ? "debug"
        : "primary";
    void this.session.requireCapability("run.attach")
      .then(() => this.session.realtime.subscribe({
        version: AGENT_WEBCLIENT_BRIDGE_VERSION,
        kind: "run",
        chatId: context.chatId,
        runId: context.runId,
        lastSeq: context.lastSeq,
        role,
        owner: toDesktopOwner(context.owner),
      }))
      .then(async (result) => {
        const ack = this.requireBridgeAck(result);
        const subscriptionId = String(ack.subscriptionId || "").trim();
        if (!subscriptionId) {
          throw new RealtimeTransportError(
            "protocol_error",
            "Desktop bridge did not return a subscriptionId",
          );
        }
        this.pendingSubscriptions.delete(context);
        context.subscriptionId = subscriptionId;
        if (context.detached) {
          await this.session.realtime.detach({
            version: AGENT_WEBCLIENT_BRIDGE_VERSION,
            target: { kind: "subscription", subscriptionId },
          });
          return;
        }
        this.subscriptions.set(subscriptionId, context);
        this.runChats.set(context.runId, context.chatId);
        this.settleAccepted(context);
        this.drainUnknown(context);
      })
      .catch((error) => this.failContext(
        context,
        error instanceof Error ? error : new Error(String(error)),
      ));
    return created.execution;
  }

  private async control(
    control: AgentWebclientRunControlKind,
    input: {
      operationId?: string;
      chatId?: string;
      runId?: string;
      owner: RunOwner;
      payload: Record<string, unknown>;
    },
  ): Promise<ApiResponse> {
    const runId = String(input.runId || "").trim();
    const chatId = String(input.chatId || "").trim() || this.runChats.get(runId) || "";
    const identity = requireIdentity(chatId, runId);
    const operationId = String(input.operationId || "").trim() || createCompactId(`desktop_${control}`);
    await this.session.requireCapability("run.control");
    const result = await this.session.realtime.request({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      operationId,
      kind: "run.control",
      chatId: identity.chatId,
      runId: identity.runId,
      control,
      owner: toDesktopOwner(input.owner),
      payload: input.payload,
    });
    const ack = this.requireBridgeAck(result);
    if (ack.operationId && ack.operationId !== operationId) {
      throw new RealtimeTransportError(
        "protocol_error",
        "Desktop bridge returned a mismatched operationId",
      );
    }
    return normalizeControlResponse(ack.response);
  }

  interrupt = (input: QueryLikeParams): Promise<ApiResponse> => this.control(
    "interrupt",
    {
      operationId: input.requestId,
      chatId: input.chatId,
      runId: input.runId,
      owner: input.owner,
      payload: {
        requestId: input.requestId,
        message: input.message,
      },
    },
  );

  submitAwaiting = (input: AwaitingSubmitInput): Promise<ApiResponse> => this.control(
    "submitAwaiting",
    {
      operationId: input.submitId,
      chatId: input.chatId,
      runId: input.runId,
      owner: input.owner,
      payload: {
        awaitingId: input.awaitingId,
        submitId: input.submitId,
        params: input.params,
      },
    },
  );

  submitTool = (input: ToolSubmitInput): Promise<ApiResponse> => this.control(
    "submitTool",
    {
      chatId: input.chatId,
      runId: input.runId,
      owner: input.owner,
      payload: {
        toolId: input.toolId,
        params: input.params,
      },
    },
  );

  steer = (input: QueryLikeParams): Promise<ApiResponse> => this.control(
    "steer",
    {
      operationId: input.steerId || input.requestId,
      chatId: input.chatId,
      runId: input.runId,
      owner: input.owner,
      payload: {
        requestId: input.requestId,
        steerId: input.steerId,
        message: input.message,
      },
    },
  );

  updateAccessLevel = async (
    input: AccessLevelUpdateParams,
  ): Promise<ApiResponse<AccessLevelUpdateResponse>> => this.control(
    "updateAccessLevel",
    {
      operationId: input.requestId,
      chatId: (input as AccessLevelUpdateParams & { chatId?: string }).chatId,
      runId: input.runId,
      owner: input.owner,
      payload: {
        requestId: input.requestId,
        accessLevel: input.accessLevel,
        reason: input.reason,
      },
    },
  ) as Promise<ApiResponse<AccessLevelUpdateResponse>>;

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeMessageListener();
    const contexts = new Set([
      ...this.operations.values(),
      ...this.subscriptions.values(),
      ...this.pendingSubscriptions,
    ]);
    for (const context of contexts) void context.detach();
    this.operations.clear();
    this.subscriptions.clear();
    this.pendingSubscriptions.clear();
    this.runChats.clear();
    this.unknownMessages.clear();
    this.unknownMessageCount = 0;
  }
}

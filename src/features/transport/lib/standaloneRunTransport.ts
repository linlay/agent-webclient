import type { AgentEvent } from "@/app/state/types";
import {
  buildAttachPayload,
  buildBTWPayload,
  buildQueryPayload,
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import {
  interruptChat,
  steerChat,
  submitAwaiting,
  submitTool,
  updateAccessLevel,
} from "@/shared/data/api/client";
import { runOwnerPayload, toRunOwner, type RunOwner } from "@/shared/data/runOwner";
import type {
  RunAccepted,
  RunCompletion,
  RunExecution,
  RunSubscribeInput,
  RunTransport,
  StartBtwInput,
  StartQueryInput,
} from "@/features/transport/contracts/realtimeTransport";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";
import type { WsClient } from "@/features/transport/lib/wsClient";
import { createWsFrameId } from "@/features/transport/lib/wsClient";

const EARLY_EVENT_BUFFER_LIMIT = 256;

type StreamStartOptions = {
  requestId: string;
  chatId: string;
  runId: string;
  owner: RunOwner;
  endpoint: string;
  payload: unknown;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
  acceptOnStart?: boolean;
  detachRemote?: boolean;
};

function eventOwner(event: AgentEvent, fallback: RunOwner): RunOwner {
  const record = event as Record<string, unknown>;
  return (
    toRunOwner({
      teamId: record.teamId,
      agentKey: event.agentKey,
    }) || fallback
  );
}

function eventSeq(event: AgentEvent): number {
  const seq = Number((event as Record<string, unknown>).seq ?? 0);
  return Number.isFinite(seq) && seq >= 0 ? seq : 0;
}

function startStreamExecution(options: StreamStartOptions): RunExecution {
  const controller = new AbortController();
  let streamAbort: (() => void) | null = null;
  let client: WsClient | null = null;
  let acceptedSettled = false;
  let completionSettled = false;
  let detached = false;
  let lastSeq = 0;
  let resolvedChatId = options.chatId;
  let resolvedRunId = options.runId;
  let resolvedOwner = options.owner;
  const earlyEvents: AgentEvent[] = [];

  let resolveAccepted!: (value: RunAccepted) => void;
  let rejectAccepted!: (reason: unknown) => void;
  const accepted = new Promise<RunAccepted>((resolve, reject) => {
    resolveAccepted = resolve;
    rejectAccepted = reject;
  });

  let resolveCompletion!: (value: RunCompletion) => void;
  const completion = new Promise<RunCompletion>((resolve) => {
    resolveCompletion = resolve;
  });

  const settleAccepted = () => {
    if (acceptedSettled || !resolvedChatId || !resolvedRunId) return;
    acceptedSettled = true;
    resolveAccepted({
      requestId: options.requestId,
      chatId: resolvedChatId,
      runId: resolvedRunId,
      owner: resolvedOwner,
      lastSeq,
    });
    for (const event of earlyEvents.splice(0)) {
      options.onEvent(event);
    }
  };

  const settleCompletion = (value: RunCompletion) => {
    if (completionSettled) return;
    completionSettled = true;
    options.signal?.removeEventListener("abort", handleExternalAbort);
    resolveCompletion(value);
  };

  const fail = (error: unknown) => {
    const normalized =
      error instanceof Error ? error : new Error(String(error || "Run stream failed"));
    if (!acceptedSettled) {
      acceptedSettled = true;
      rejectAccepted(normalized);
    }
    settleCompletion({ reason: "error", lastSeq, error: normalized });
  };

  const deliverEvent = (event: AgentEvent) => {
    resolvedChatId = String(event.chatId || resolvedChatId || "").trim();
    resolvedRunId = String(event.runId || resolvedRunId || "").trim();
    resolvedOwner = eventOwner(event, resolvedOwner);
    lastSeq = Math.max(lastSeq, eventSeq(event));

    if (!acceptedSettled) {
      earlyEvents.push(event);
      if (earlyEvents.length > EARLY_EVENT_BUFFER_LIMIT) {
        streamAbort?.();
        fail(
          new RealtimeTransportError(
            "early_event_buffer_overflow",
            "Run emitted too many events before its identity was accepted",
          ),
        );
        return;
      }
      settleAccepted();
      return;
    }
    options.onEvent(event);
  };

  const detach = async (): Promise<void> => {
    if (detached) return;
    detached = true;
    controller.abort();
    streamAbort?.();
    if (options.detachRemote && client && resolvedRunId) {
      try {
        await client.request({
          type: dataEndpoints.detach.path,
          payload: {
            runId: resolvedRunId,
            ...runOwnerPayload(resolvedOwner),
            reason: "consumer_detach",
          },
        });
      } catch {
        // Local detach is authoritative for this consumer.
      }
    }
    if (!acceptedSettled) {
      acceptedSettled = true;
      rejectAccepted(new DOMException("The operation was detached.", "AbortError"));
    }
    settleCompletion({ reason: "detached", lastSeq });
  };

  const handleExternalAbort = () => {
    void detach();
  };
  if (options.signal) {
    if (options.signal.aborted) {
      void detach();
    } else {
      options.signal.addEventListener("abort", handleExternalAbort, { once: true });
    }
  }

  void ensureStandaloneWsClient()
    .then((resolvedClient) => {
      if (detached) return;
      client = resolvedClient;
      const stream = resolvedClient.stream({
        type: options.endpoint,
        payload: options.payload,
        signal: controller.signal,
        requestId: createWsFrameId("wsstream"),
        onEvent: deliverEvent,
        onDone: (reason, finalSeq) => {
          lastSeq = Math.max(lastSeq, Number(finalSeq) || 0);
          if (!acceptedSettled) {
            settleAccepted();
            if (!acceptedSettled) {
              fail(
                new RealtimeTransportError(
                  "run_identity_missing",
                  "Run completed before chatId and runId were accepted",
                ),
              );
              return;
            }
          }
          settleCompletion({ reason: reason || "done", lastSeq });
        },
        onError: (error) => {
          if (detached || error.name === "AbortError") return;
          fail(error);
        },
      });
      streamAbort = stream.abort;
      if (options.acceptOnStart) {
        settleAccepted();
      }
    })
    .catch(fail);

  return { accepted, completion, detach };
}

export class StandaloneRunTransport implements RunTransport {
  startQuery(input: StartQueryInput): RunExecution {
    return startStreamExecution({
      requestId: input.requestId,
      chatId: String(input.chatId || "").trim(),
      runId: "",
      owner: input.owner,
      endpoint: dataEndpoints.query.path,
      payload: buildQueryPayload(input),
      onEvent: input.onEvent,
      signal: input.signal,
      detachRemote: true,
    });
  }

  startBtw(input: StartBtwInput): RunExecution {
    return startStreamExecution({
      requestId: input.requestId,
      chatId: input.chatId,
      runId: String(input.runId || "").trim(),
      owner: input.owner,
      endpoint: dataEndpoints.btw.path,
      payload: buildBTWPayload(input),
      onEvent: input.onEvent,
      signal: input.signal,
      detachRemote: true,
    });
  }

  subscribe(input: RunSubscribeInput): RunExecution {
    return startStreamExecution({
      requestId: input.requestId || createWsFrameId("wsstream"),
      chatId: input.chatId,
      runId: input.runId,
      owner: input.owner,
      endpoint: dataEndpoints.attach.path,
      payload: buildAttachPayload({
        runId: input.runId,
        owner: input.owner,
        lastSeq: input.lastSeq,
      }),
      onEvent: input.onEvent,
      signal: input.signal,
      acceptOnStart: true,
      detachRemote: true,
    });
  }

  interrupt = interruptChat;
  submitAwaiting = submitAwaiting;
  submitTool = submitTool;
  steer = steerChat;
  updateAccessLevel = updateAccessLevel;
}

import type { AgentEvent } from "@/app/state/types";
import {
  buildAccessLevelPayload,
  buildAttachPayload,
  buildBTWPayload,
  buildQueryPayload,
  buildRunControlPayload,
  buildRunSubmitPayload,
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import { runOwnerPayload, toRunOwner, type RunOwner } from "@/shared/data/runOwner";
import type {
  RunIdentity,
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
  lastSeq?: number;
  owner: RunOwner;
  endpoint: string;
  payload: unknown;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
  acceptOnStart?: boolean;
  detachRemote?: boolean;
  ensureClient: () => Promise<WsClient>;
  registerLifecycle?: (control: RunSurfaceLifecycleControl) => () => void;
};

type RunSurfaceLifecycleControl = {
  deactivate(): void;
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
  let streamAbort: (() => void) | null = null;
  let client: WsClient | null = null;
  let identitySettled = false;
  let completionSettled = false;
  let detached = false;
  let surfaceReleased = false;
  let launchGeneration = 0;
  let surfaceReleasePromise: Promise<void> | null = null;
  let lastSeq = Math.max(0, Number(options.lastSeq) || 0);
  let resolvedChatId = options.chatId;
  let resolvedRunId = options.runId;
  let resolvedOwner = options.owner;
  const earlyEvents: AgentEvent[] = [];
  let unregisterLifecycle: () => void = () => undefined;

  let resolveIdentity!: (value: RunIdentity) => void;
  let rejectIdentity!: (reason: unknown) => void;
  const identity = new Promise<RunIdentity>((resolve, reject) => {
    resolveIdentity = resolve;
    rejectIdentity = reject;
  });

  let resolveCompletion!: (value: RunCompletion) => void;
  const completion = new Promise<RunCompletion>((resolve) => {
    resolveCompletion = resolve;
  });

  const settleIdentity = () => {
    if (identitySettled || !resolvedChatId || !resolvedRunId) return;
    identitySettled = true;
    resolveIdentity({
      requestId: options.requestId,
      chatId: resolvedChatId,
      runId: resolvedRunId,
      owner: resolvedOwner,
      lastSeq,
    });
    if (!surfaceReleased) {
      for (const event of earlyEvents.splice(0)) {
        options.onEvent(event);
      }
    }
  };

  const settleCompletion = (value: RunCompletion) => {
    if (completionSettled) return;
    completionSettled = true;
    unregisterLifecycle();
    options.signal?.removeEventListener("abort", handleExternalAbort);
    resolveCompletion(value);
  };

  const fail = (error: unknown) => {
    const normalized =
      error instanceof Error ? error : new Error(String(error || "Run stream failed"));
    if (!identitySettled) {
      identitySettled = true;
      rejectIdentity(normalized);
    }
    settleCompletion({ reason: "error", lastSeq, error: normalized });
  };

  const deliverEvent = (event: AgentEvent) => {
    resolvedChatId = String(event.chatId || resolvedChatId || "").trim();
    resolvedRunId = String(event.runId || resolvedRunId || "").trim();
    resolvedOwner = eventOwner(event, resolvedOwner);
    lastSeq = Math.max(lastSeq, eventSeq(event));

    if (!identitySettled) {
      earlyEvents.push(event);
      if (earlyEvents.length > EARLY_EVENT_BUFFER_LIMIT) {
        streamAbort?.();
        fail(
          new RealtimeTransportError(
            "early_event_buffer_overflow",
            "Run emitted too many events before its canonical identity",
          ),
        );
        return;
      }
      settleIdentity();
      if (surfaceReleased && identitySettled) {
        finalizeSurfaceRelease();
      }
      return;
    }
    if (surfaceReleased) {
      return;
    }
    options.onEvent(event);
  };

  const stopStream = () => {
    launchGeneration += 1;
    streamAbort?.();
    streamAbort = null;
  };

  const detachObserver = async (reason: "consumer_detach" | "surface_inactive") => {
    if (!client || !resolvedRunId) return;
    try {
      await client.request({
        type: dataEndpoints.detach.path,
        payload: {
          runId: resolvedRunId,
          ...runOwnerPayload(resolvedOwner),
          reason,
        },
      });
    } catch {
      // Detach is idempotent and local observation has already stopped.
    }
  };

  const finalizeSurfaceRelease = () => {
    if (
      !surfaceReleased ||
      !identitySettled ||
      completionSettled ||
      surfaceReleasePromise
    ) {
      return;
    }
    stopStream();
    surfaceReleasePromise = detachObserver("surface_inactive");
    settleCompletion({ reason: "detached", lastSeq });
  };

  const launch = (endpoint: string, payload: unknown, acceptOnStart = false) => {
    const generation = ++launchGeneration;
    void options.ensureClient()
      .then((resolvedClient) => {
        if (detached || completionSettled || generation !== launchGeneration) return;
        client = resolvedClient;
        if (surfaceReleased && resolvedRunId) {
          if (acceptOnStart) settleIdentity();
          finalizeSurfaceRelease();
          return;
        }
        const stream = resolvedClient.stream({
          type: endpoint,
          payload,
          requestId: createWsFrameId("wsstream"),
          onEvent: deliverEvent,
          onDone: (reason, finalSeq) => {
            if (generation !== launchGeneration) return;
            lastSeq = Math.max(lastSeq, Number(finalSeq) || 0);
            if (!identitySettled) {
              settleIdentity();
              if (!identitySettled) {
                fail(new RealtimeTransportError(
                  "run_identity_missing",
                  "Run completed before chatId and runId were identified",
                ));
                return;
              }
            }
            settleCompletion({ reason: reason || "done", lastSeq });
          },
          onError: (error) => {
            if (detached || generation !== launchGeneration || error.name === "AbortError") return;
            fail(error);
          },
        });
        streamAbort = stream.abort;
        if (acceptOnStart) {
          settleIdentity();
          finalizeSurfaceRelease();
        }
      })
      .catch((error) => {
        if (generation === launchGeneration) fail(error);
      });
  };

  const deactivate = () => {
    if (surfaceReleased || detached || completionSettled) return;
    surfaceReleased = true;
    finalizeSurfaceRelease();
  };

  const detach = async (): Promise<void> => {
    if (detached) return;
    detached = true;
    const shouldDetachRemote = !completionSettled;
    if (shouldDetachRemote && !surfaceReleasePromise) {
      stopStream();
    }
    if (surfaceReleasePromise) {
      await surfaceReleasePromise;
    } else if (shouldDetachRemote && options.detachRemote) {
      await detachObserver("consumer_detach");
    }
    if (!identitySettled) {
      identitySettled = true;
      rejectIdentity(new DOMException("The operation was detached.", "AbortError"));
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

  unregisterLifecycle = options.registerLifecycle?.({ deactivate }) || unregisterLifecycle;
  launch(options.endpoint, options.payload, options.acceptOnStart);

  return { identity, completion, detach };
}

function failedExecution(error: Error): RunExecution {
  return {
    identity: Promise.reject(error),
    completion: Promise.resolve({ reason: "error", lastSeq: 0, error }),
    detach: async () => undefined,
  };
}

export class PlatformRunTransport implements RunTransport {
  private readonly lifecycleControls = new Set<RunSurfaceLifecycleControl>();
  private surfaceActive = true;

  constructor(
    private readonly ensureClient: () => Promise<WsClient> = ensureStandaloneWsClient,
    private readonly options: { supportsBtw?: boolean } = {},
  ) {}

  setSurfaceActive(active: boolean): void {
    if (this.surfaceActive === active) return;
    this.surfaceActive = active;
    if (!active) {
      for (const control of this.lifecycleControls) control.deactivate();
    }
  }

  private readonly registerLifecycle = (control: RunSurfaceLifecycleControl) => {
    this.lifecycleControls.add(control);
    if (!this.surfaceActive) queueMicrotask(() => control.deactivate());
    return () => this.lifecycleControls.delete(control);
  };

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
      ensureClient: this.ensureClient,
      registerLifecycle: this.registerLifecycle,
    });
  }

  startBtw(input: StartBtwInput): RunExecution {
    if (this.options.supportsBtw === false) {
      return failedExecution(new RealtimeTransportError(
        "unsupported_in_current_view",
        "BTW is not supported by the Desktop Platform Frame Port",
      ));
    }
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
      ensureClient: this.ensureClient,
      registerLifecycle: this.registerLifecycle,
    });
  }

  subscribe(input: RunSubscribeInput): RunExecution {
    return startStreamExecution({
      requestId: input.requestId || createWsFrameId("wsstream"),
      chatId: input.chatId,
      runId: input.runId,
      lastSeq: input.lastSeq,
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
      ensureClient: this.ensureClient,
      registerLifecycle: this.registerLifecycle,
    });
  }

  interrupt: RunTransport["interrupt"] = async (input) =>
    (await this.ensureClient()).request({
      type: dataEndpoints.interrupt.path,
      payload: buildRunControlPayload(input),
    });

  submitAwaiting: RunTransport["submitAwaiting"] = async (input) =>
    (await this.ensureClient()).request({
      type: dataEndpoints.submit.path,
      payload: buildRunSubmitPayload(input),
    });

  submitTool: RunTransport["submitTool"] = async (input) =>
    (await this.ensureClient()).request({
      type: dataEndpoints.submit.path,
      payload: buildRunSubmitPayload(input),
    });

  steer: RunTransport["steer"] = async (input) =>
    (await this.ensureClient()).request({
      type: dataEndpoints.steer.path,
      payload: buildRunControlPayload(input),
    });

  updateAccessLevel: RunTransport["updateAccessLevel"] = async (input) =>
    (await this.ensureClient()).request({
      type: dataEndpoints.accessLevelUpdate.path,
      payload: buildAccessLevelPayload(input),
    });
}

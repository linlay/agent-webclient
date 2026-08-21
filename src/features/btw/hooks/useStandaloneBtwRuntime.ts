import { useCallback, useEffect, useRef, useState } from "react";
import { appReducer } from "@/app/state/reducer";
import { createInitialState } from "@/app/state/state";
import type { AgentEvent, TimelineNode } from "@/app/state/types";
import type { BTWSessionState } from "@/features/btw/lib/btwTypes";
import {
  createLocalCacheFromState,
  createLiveProcessorState,
  type LocalCache,
} from "@/features/conversation/lib/liveEventCache";
import { applyLiveEventCommand } from "@/features/conversation/lib/liveEventDispatch";
import { processStreamEvent } from "@/features/events/lib/eventProcessor";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import type { RunExecution } from "@/features/transport/contracts/realtimeTransport";
import {
  createRequestId,
  type ApiResponse,
  type BTWInterruptResponse,
  type BTWStreamParams,
} from "@/shared/data";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { sameRunOwner, type RunOwner } from "@/shared/data/runOwner";
import { toText } from "@/shared/utils/eventUtils";

export function createStandaloneBtwSession(
  parentChatId: string,
  btwId: string,
  owner: RunOwner | null,
): BTWSessionState {
  return {
    parentChatId,
    btwId,
    runId: "",
    requestId: "",
    agentKey: owner?.kind === "agent" ? owner.agentKey : "",
    owner: owner || undefined,
    status: "idle",
    interruptReady: false,
    interruptPending: false,
    draft: "",
    error: "",
    focusToken: 1,
    lastSeq: 0,
    updatedAt: Date.now(),
    usage: null,
    config: {},
    projection: {
      ...createInitialState(),
      chatId: parentChatId,
    },
  };
}

function appendSystemError(session: BTWSessionState, message: string): void {
  const nodeId = `btw_surface_error_${Date.now()}`;
  const node: TimelineNode = {
    id: nodeId,
    kind: "message",
    role: "system",
    text: message,
    ts: Date.now(),
  };
  session.projection = appReducer(session.projection, {
    type: "SET_TIMELINE_NODE",
    id: nodeId,
    node,
  });
  session.projection = appReducer(session.projection, {
    type: "APPEND_TIMELINE_ORDER",
    id: nodeId,
  });
}

export function useStandaloneBtwRuntime(input: {
  chatId: string;
  initialBtwId?: string;
  owner: RunOwner | null;
  onBtwId?: (btwId: string) => void;
}): {
  session: BTWSessionState;
  send: () => void;
  setDraft: (draft: string) => void;
  interrupt: () => void;
  newBranch: () => boolean;
  patchTimelineNode: (node: TimelineNode) => void;
} {
  const chatId = String(input.chatId || "").trim();
  const initialBtwId = String(input.initialBtwId || "").trim();
  const runs = useRunTransport();
  const [session, setSession] = useState(() =>
    createStandaloneBtwSession(chatId, initialBtwId, input.owner),
  );
  const sessionRef = useRef(session);
  const cacheRef = useRef<LocalCache>(createLocalCacheFromState(session.projection));
  const executionRef = useRef<RunExecution | null>(null);
  const generationRef = useRef(0);
  const onBtwIdRef = useRef(input.onBtwId);
  onBtwIdRef.current = input.onBtwId;
  sessionRef.current = session;

  const publish = useCallback((next: BTWSessionState) => {
    next.updatedAt = Date.now();
    next.projection = { ...next.projection };
    sessionRef.current = next;
    setSession({ ...next });
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    void executionRef.current?.detach();
    executionRef.current = null;
    const next = createStandaloneBtwSession(chatId, initialBtwId, input.owner);
    cacheRef.current = createLocalCacheFromState(next.projection);
    publish(next);
  }, [chatId, publish]);

  useEffect(() => {
    if (!input.owner) return;
    const current = sessionRef.current;
    if (sameRunOwner(current.owner, input.owner)) return;
    current.owner = input.owner;
    current.agentKey = input.owner.kind === "agent" ? input.owner.agentKey : "";
    publish(current);
  }, [input.owner, publish]);

  useEffect(() => () => {
    generationRef.current += 1;
    void executionRef.current?.detach();
    executionRef.current = null;
  }, []);

  const handleEvent = useCallback((generation: number, event: AgentEvent) => {
    if (generationRef.current !== generation) return;
    const current = sessionRef.current;
    const type = toText(event.type);
    const eventBtwId = toText((event as Record<string, unknown>).btwId);
    if (eventBtwId && eventBtwId !== current.btwId) {
      current.btwId = eventBtwId;
      onBtwIdRef.current?.(eventBtwId);
    }
    if (event.runId) current.runId = toText(event.runId);
    if (event.requestId) current.requestId = toText(event.requestId);
    const seq = Number((event as Record<string, unknown>).seq);
    if (Number.isFinite(seq) && seq > current.lastSeq) current.lastSeq = seq;
    if (current.status === "running" && current.runId && current.owner) {
      current.interruptReady = true;
    }

    current.projection = appReducer(current.projection, {
      type: "PUSH_EVENT",
      event,
    });
    const commands = processStreamEvent(
      event,
      createLiveProcessorState(cacheRef.current, current.projection),
      { mode: "live", reasoningExpandedDefault: false },
    );
    for (const command of commands) {
      applyLiveEventCommand({
        command,
        cache: cacheRef.current,
        state: current.projection,
        dispatch: (action) => {
          current.projection = appReducer(current.projection, action);
        },
      });
    }

    if (type === "usage.snapshot") {
      current.usage = event as BTWSessionState["usage"];
    } else if (type === "run.complete" || type === "run.cancel") {
      current.status = "idle";
      current.error = "";
      current.interruptReady = false;
      current.interruptPending = false;
    } else if (type === "run.error") {
      current.status = "error";
      current.error = formatPlatformErrorForDisplay(event).message;
      current.interruptReady = false;
      current.interruptPending = false;
    }
    publish(current);
  }, [publish]);

  const send = useCallback(() => {
    const current = sessionRef.current;
    const message = current.draft.trim();
    const owner = current.owner || input.owner;
    if (!chatId || !message || !owner || current.status === "running") return;

    current.owner = owner;
    current.agentKey = owner.kind === "agent" ? owner.agentKey : "";
    current.status = "running";
    current.error = "";
    current.interruptReady = false;
    current.interruptPending = false;
    current.draft = "";
    current.requestId = createRequestId("req");
    current.runId = "";
    current.lastSeq = 0;
    current.focusToken += 1;
    generationRef.current += 1;
    const generation = generationRef.current;

    const nodeId = `btw_surface_user_${current.requestId}`;
    const node: TimelineNode = {
      id: nodeId,
      kind: "message",
      role: "user",
      text: message,
      ts: Date.now(),
    };
    current.projection = appReducer(current.projection, {
      type: "SET_TIMELINE_NODE",
      id: nodeId,
      node,
    });
    current.projection = appReducer(current.projection, {
      type: "APPEND_TIMELINE_ORDER",
      id: nodeId,
    });
    cacheRef.current = createLocalCacheFromState(current.projection);
    publish(current);

    const params: BTWStreamParams = {
      requestId: current.requestId,
      chatId,
      btwId: current.btwId || undefined,
      message,
      stream: true,
    };
    const execution = runs.startBtw({
      ...params,
      owner,
      onEvent: (event) => handleEvent(generation, event),
    });
    executionRef.current = execution;

    void execution.identity
      .then((identity) => {
        if (generationRef.current !== generation) return;
        const active = sessionRef.current;
        active.requestId = identity.requestId;
        active.runId = identity.runId;
        active.owner = identity.owner;
        active.agentKey = identity.owner.kind === "agent" ? identity.owner.agentKey : "";
        active.interruptReady = true;
        publish(active);
      })
      .catch((cause: unknown) => {
        if (generationRef.current !== generation) return;
        const active = sessionRef.current;
        const display = formatPlatformErrorForDisplay(cause);
        active.status = "error";
        active.error = display.message;
        active.interruptReady = false;
        appendSystemError(active, display.message);
        publish(active);
      });
    void execution.completion.then((completion) => {
      if (generationRef.current !== generation) return;
      executionRef.current = null;
      const active = sessionRef.current;
      if (completion.error) {
        const display = formatPlatformErrorForDisplay(completion.error);
        active.status = "error";
        if (active.error !== display.message) {
          appendSystemError(active, display.message);
        }
        active.error = display.message;
      } else if (active.status === "running") {
        active.status = "idle";
        active.error = "";
      }
      active.interruptReady = false;
      active.interruptPending = false;
      publish(active);
    });
  }, [chatId, handleEvent, input.owner, publish, runs]);

  const setDraft = useCallback((draft: string) => {
    const current = sessionRef.current;
    current.draft = draft;
    publish(current);
  }, [publish]);

  const patchTimelineNode = useCallback((node: TimelineNode) => {
    const current = sessionRef.current;
    current.projection = appReducer(current.projection, {
      type: "SET_TIMELINE_NODE",
      id: node.id,
      node,
    });
    cacheRef.current = createLocalCacheFromState(current.projection);
    publish(current);
  }, [publish]);

  const newBranch = useCallback((): boolean => {
    const current = sessionRef.current;
    if (current.status === "running") return false;
    generationRef.current += 1;
    void executionRef.current?.detach();
    executionRef.current = null;
    const next = createStandaloneBtwSession(chatId, "", current.owner || input.owner);
    cacheRef.current = createLocalCacheFromState(next.projection);
    publish(next);
    return true;
  }, [chatId, input.owner, publish]);

  const interrupt = useCallback(() => {
    const current = sessionRef.current;
    const owner = current.owner || input.owner;
    if (
      !owner ||
      current.status !== "running" ||
      !current.runId ||
      !current.interruptReady ||
      current.interruptPending
    ) return;
    const runId = current.runId;
    const generation = generationRef.current;
    current.interruptPending = true;
    current.error = "";
    publish(current);
    void (runs.interrupt({
      requestId: createRequestId("req"),
      chatId,
      runId,
      owner,
      message: "",
      planningMode: false,
    }) as Promise<ApiResponse<BTWInterruptResponse>>)
      .then((response) => {
        if (generationRef.current !== generation) return;
        const active = sessionRef.current;
        if (response.data?.accepted === true && response.data.runId === runId) {
          generationRef.current += 1;
          void executionRef.current?.detach();
          executionRef.current = null;
          active.status = "idle";
          active.error = "";
          active.interruptReady = false;
        } else {
          active.error = String(response.data?.detail || response.msg || "interrupt rejected");
          appendSystemError(active, active.error);
        }
        active.interruptPending = false;
        publish(active);
      })
      .catch((cause: unknown) => {
        if (generationRef.current !== generation) return;
        const active = sessionRef.current;
        const display = formatPlatformErrorForDisplay(cause);
        active.error = display.message;
        active.interruptPending = false;
        appendSystemError(active, display.message);
        publish(active);
      });
  }, [chatId, input.owner, publish, runs]);

  return {
    session,
    send,
    setDraft,
    interrupt,
    newBranch,
    patchTimelineNode,
  };
}

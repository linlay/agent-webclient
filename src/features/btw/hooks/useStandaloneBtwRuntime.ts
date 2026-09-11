import { useCallback, useEffect, useRef, useState } from "react";
import { appReducer } from "@/app/state/reducer";
import { createInitialState } from "@/app/state/state";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import type { BTWSessionState } from "@/features/btw/lib/btwTypes";
import { resolveBTWSendMessage } from "@/features/btw/lib/btwSend";
import {
  createLocalCacheFromState,
  createLiveProcessorState,
  type LocalCache,
} from "@/features/conversation/lib/liveEventCache";
import { applyLiveEventCommand } from "@/features/conversation/lib/liveEventDispatch";
import { processStreamEvent } from "@/features/events/lib/eventProcessor";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import type { RunExecution, RunTransportPurpose } from "@/features/transport/contracts/realtimeTransport";
import {
  createRequestId,
  type ApiResponse,
  type BTWInterruptResponse,
  type BTWStreamParams,
} from "@/shared/data";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { sameRunOwner, type RunOwner } from "@/shared/data/runOwner";
import { toText } from "@/shared/utils/eventUtils";
import {
  addSelectedTextFragment,
  selectedTextReferenceToAttachment,
  type SelectedTextFragment,
} from "@/features/selection/lib/selectedTextReference";

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
    draftSelections: [],
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
  initialRunId?: string;
  owner: RunOwner | null;
  onBtwId?: (btwId: string) => void;
  transportPurpose?: RunTransportPurpose;
}): {
  session: BTWSessionState;
  send: (selectionOnlyPrompt?: string) => void;
  setDraft: (draft: string) => void;
  addDraftSelection: (fragment: SelectedTextFragment) => boolean;
  removeDraftSelection: (referenceId: string) => void;
  interrupt: () => void;
  newBranch: () => boolean;
  patchTimelineNode: (node: TimelineNode) => void;
} {
  const chatId = String(input.chatId || "").trim();
  const initialBtwId = String(input.initialBtwId || "").trim();
  const initialRunId = String(input.initialRunId || "").trim();
  const transportPurpose = input.transportPurpose;
  const runs = useRunTransport();
  const [session, setSession] = useState(() =>
    createStandaloneBtwSession(chatId, initialBtwId, input.owner),
  );
  const sessionRef = useRef(session);
  const cacheRef = useRef<LocalCache>(createLocalCacheFromState(session.projection));
  const executionRef = useRef<RunExecution | null>(null);
  const generationRef = useRef(0);
  const onBtwIdRef = useRef(input.onBtwId);
  const attachedInitialRunKeyRef = useRef("");
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
    attachedInitialRunKeyRef.current = "";
  }, [chatId, initialRunId, publish, transportPurpose]);

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

  const handleEvent = useCallback((
    generation: number,
    event: AgentEvent,
    mode: "live" | "replay" = "live",
  ) => {
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
      { mode, reasoningExpandedDefault: false },
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

  useEffect(() => {
    const owner = input.owner;
    const key = [chatId, initialRunId, transportPurpose].join("\u0000");
    if (!chatId || !initialRunId || !owner || attachedInitialRunKeyRef.current === key) {
      return;
    }
    attachedInitialRunKeyRef.current = key;
    generationRef.current += 1;
    const generation = generationRef.current;
    const current = sessionRef.current;
    current.owner = owner;
    current.agentKey = owner.kind === "agent" ? owner.agentKey : "";
    current.runId = initialRunId;
    current.status = "running";
    current.interruptReady = true;
    publish(current);
    const execution = runs.subscribe({
      chatId,
      runId: initialRunId,
      owner,
      lastSeq: 0,
      role: "btw",
      ...(transportPurpose ? { transportPurpose } : {}),
      onEvent: (event) => handleEvent(generation, event, "replay"),
    });
    executionRef.current = execution;
    void execution.identity.then((identity) => {
      if (generationRef.current !== generation) return;
      const active = sessionRef.current;
      active.requestId = identity.requestId;
      active.runId = identity.runId;
      active.owner = identity.owner;
      active.agentKey = identity.owner.kind === "agent" ? identity.owner.agentKey : "";
      active.interruptReady = true;
      publish(active);
    }).catch((cause: unknown) => {
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
        active.error = display.message;
        appendSystemError(active, display.message);
      } else if (active.status === "running") {
        active.status = "idle";
        active.error = "";
      }
      active.interruptReady = false;
      active.interruptPending = false;
      publish(active);
    });
  }, [chatId, handleEvent, initialRunId, input.owner, publish, runs, transportPurpose]);

  const send = useCallback((selectionOnlyPrompt = "") => {
    const current = sessionRef.current;
    const selectedFragments = current.draftSelections;
    const message = resolveBTWSendMessage(
      current.draft,
      selectedFragments.length,
      selectionOnlyPrompt,
    );
    const owner = current.owner || input.owner;
    if (!chatId || !message || !owner || current.status === "running") return;
    const references = selectedFragments.map((fragment) => fragment.reference);
    const attachments = selectedFragments.map(selectedTextReferenceToAttachment);
    const acceptedReferenceIds = new Set(
      selectedFragments.map((fragment) => fragment.reference.id),
    );

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
      attachments,
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
      references: references.length > 0 ? references : undefined,
      stream: true,
    };
    const execution = runs.startBtw({
      ...params,
      owner,
      ...(transportPurpose ? { transportPurpose } : {}),
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
        active.draftSelections = active.draftSelections.filter(
          (fragment) => !acceptedReferenceIds.has(fragment.reference.id),
        );
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
  }, [chatId, handleEvent, input.owner, publish, runs, transportPurpose]);

  const setDraft = useCallback((draft: string) => {
    const current = sessionRef.current;
    current.draft = draft;
    publish(current);
  }, [publish]);

  const addDraftSelection = useCallback((fragment: SelectedTextFragment) => {
    const current = sessionRef.current;
    current.draftSelections = addSelectedTextFragment(
      current.draftSelections,
      fragment,
    );
    current.focusToken += 1;
    publish(current);
    return true;
  }, [publish]);

  const removeDraftSelection = useCallback((referenceId: string) => {
    const normalizedReferenceId = String(referenceId || "").trim();
    if (!normalizedReferenceId) return;
    const current = sessionRef.current;
    const next = current.draftSelections.filter(
      (fragment) => fragment.reference.id !== normalizedReferenceId,
    );
    if (next.length === current.draftSelections.length) return;
    current.draftSelections = next;
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
      ...(transportPurpose ? { transportPurpose } : {}),
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
  }, [chatId, input.owner, publish, runs, transportPurpose]);

  return {
    session,
    send,
    setDraft,
    addDraftSelection,
    removeDraftSelection,
    interrupt,
    newBranch,
    patchTimelineNode,
  };
}

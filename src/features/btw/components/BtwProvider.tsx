import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AppAction } from "@/app/state/actions";
import { useAppContext } from "@/app/state/AppContext";
import { appReducer } from "@/app/state/reducer";
import { createInitialState } from "@/app/state/state";
import type { AgentEvent, TimelineNode } from "@/app/state/types";
import {
  createLocalCacheFromState,
  createLiveProcessorState,
  type LocalCache,
} from "@/features/conversation/lib/liveEventCache";
import { applyLiveEventCommand } from "@/features/conversation/lib/liveEventDispatch";
import { processStreamEvent } from "@/features/events/lib/eventProcessor";
import { executeAttachRunSse, executeBTWStreamSse } from "@/features/transport/lib/queryStreamRuntime.sse";
import { resolveRunOwner } from "@/features/runs/lib/runOwner";
import { toRunOwner } from "@/shared/data/runOwner";
import {
  createRequestId,
  interruptBTWRun,
  type BTWStreamParams,
} from "@/shared/data";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { t } from "@/shared/i18n";
import { toText } from "@/shared/utils/eventUtils";
import { readEventTeamId } from "@/shared/utils/eventFieldReaders";
import {
  persistBTWSessions,
  readPersistedBTWSessions,
} from "@/features/btw/lib/btwPersistence";
import type {
  BTWSessionState,
  OpenBTWOptions,
  PersistedBTWSession,
} from "@/features/btw/lib/btwTypes";
import {
  claimRestoredBTWRun,
  discardBTWSessionRegistry,
  isAcceptedBTWInterrupt,
  isCurrentBTWRuntime,
  settleBTWInterrupt,
} from "@/features/btw/lib/btwRuntime";

interface BTWRuntime {
  session: BTWSessionState;
  cache: LocalCache;
  generation: number;
}

interface BTWContextValue {
  sessions: Map<string, BTWSessionState>;
  getSession: (parentChatId?: string) => BTWSessionState | null;
  openBTW: (options?: OpenBTWOptions) => boolean;
  sendBTW: (parentChatId: string, message?: string, options?: OpenBTWOptions) => Promise<boolean>;
  setDraft: (parentChatId: string, draft: string) => void;
  patchTimelineNode: (parentChatId: string, node: TimelineNode) => void;
  newBranch: (parentChatId: string) => boolean;
  discardBTW: (parentChatId: string) => boolean;
  interruptBTW: (parentChatId: string) => Promise<boolean>;
}

const BTWContext = createContext<BTWContextValue | null>(null);

function createProjection(
  parentChatId: string,
  persisted?: PersistedBTWSession,
) {
  let projection = createInitialState();
  projection = {
    ...projection,
    chatId: parentChatId,
  };
  for (const item of persisted?.transcript || []) {
    const node: TimelineNode =
      item.role === "assistant"
        ? {
            id: item.id,
            kind: "content",
            contentId: item.id,
            text: item.text,
            status: "completed",
            ts: item.timestamp,
          }
        : {
            id: item.id,
            kind: "message",
            role: item.role === "system" ? "system" : "user",
            text: item.text,
            attachments: item.attachments,
            ts: item.timestamp,
          };
    projection = appReducer(projection, {
      type: "SET_TIMELINE_NODE",
      id: node.id,
      node,
    });
    projection = appReducer(projection, {
      type: "APPEND_TIMELINE_ORDER",
      id: node.id,
    });
  }
  return projection;
}

function createSession(
  parentChatId: string,
  persisted?: PersistedBTWSession,
): BTWSessionState {
  const restoredRunning =
    persisted?.status === "running" && Boolean(persisted.runId);
  const restoredStatus =
    persisted?.status === "running"
      ? restoredRunning
        ? "running"
        : "idle"
      : persisted?.status || "idle";
  return {
    parentChatId,
    btwId: persisted?.btwId || "",
    runId: persisted?.runId || "",
    requestId: persisted?.requestId || "",
    agentKey: persisted?.agentKey || "",
    owner: persisted?.owner,
    status: restoredStatus,
    interruptReady: Boolean(
      restoredRunning && persisted?.runId && Boolean(persisted?.owner || persisted?.agentKey),
    ),
    interruptPending: false,
    draft: persisted?.draft || "",
    error: "",
    focusToken: 0,
    lastSeq: persisted?.lastSeq || 0,
    updatedAt: persisted?.updatedAt || Date.now(),
    usage: null,
    config: persisted?.config || {},
    projection: createProjection(parentChatId, persisted),
  };
}

function appendSystemError(runtime: BTWRuntime, message: string): void {
  const nodeId = `btw_error_${Date.now()}`;
  const node: TimelineNode = {
    id: nodeId,
    kind: "message",
    role: "system",
    text: message,
    ts: Date.now(),
  };
  runtime.session.projection = appReducer(runtime.session.projection, {
    type: "SET_TIMELINE_NODE",
    id: nodeId,
    node,
  });
  runtime.session.projection = appReducer(runtime.session.projection, {
    type: "APPEND_TIMELINE_ORDER",
    id: nodeId,
  });
  runtime.cache = createLocalCacheFromState(runtime.session.projection);
}

export const BtwProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { dispatch: appDispatch, stateRef } = useAppContext();
  const initialPersistedRef = useRef<PersistedBTWSession[] | null>(null);
  if (!initialPersistedRef.current) {
    initialPersistedRef.current = readPersistedBTWSessions();
  }
  const initialSessionsRef = useRef<Map<string, BTWSessionState> | null>(null);
  if (!initialSessionsRef.current) {
    initialSessionsRef.current = new Map(
      initialPersistedRef.current.map((item) => [
        item.parentChatId,
        createSession(item.parentChatId, item),
      ]),
    );
  }
  const [sessions, setSessions] = useState(initialSessionsRef.current);
  const sessionsRef = useRef(sessions);
  const runtimesRef = useRef(new Map<string, BTWRuntime>());
  // Only runs restored at mount are attach candidates. Live /api/btw streams
  // are already being observed by sendBTW and must never be attached again.
  const restoredRunIdsRef = useRef<Set<string> | null>(null);
  if (!restoredRunIdsRef.current) {
    restoredRunIdsRef.current = new Set(
      initialPersistedRef.current
        .filter((item) => item.status === "running" && item.runId)
        .map((item) => item.runId),
    );
  }
  const persistTimerRef = useRef<number | null>(null);
  sessionsRef.current = sessions;

  const isCurrentRuntime = useCallback(
    (runtime: BTWRuntime, generation?: number): boolean =>
      isCurrentBTWRuntime(runtimesRef.current, runtime, generation),
    [],
  );

  const publish = useCallback((runtime: BTWRuntime) => {
    if (!isCurrentRuntime(runtime)) return;
    runtime.session = {
      ...runtime.session,
      projection: { ...runtime.session.projection },
      updatedAt: Date.now(),
    };
    sessionsRef.current = new Map(sessionsRef.current).set(
      runtime.session.parentChatId,
      runtime.session,
    );
    setSessions(sessionsRef.current);
  }, [isCurrentRuntime]);

  const getRuntime = useCallback((parentChatId: string): BTWRuntime => {
    const normalized = String(parentChatId || "").trim();
    const existing = runtimesRef.current.get(normalized);
    if (existing) return existing;
    const session = sessionsRef.current.get(normalized) || createSession(normalized);
    const runtime = {
      session,
      cache: createLocalCacheFromState(session.projection),
      generation: 0,
    };
    runtimesRef.current.set(normalized, runtime);
    if (!sessionsRef.current.has(normalized)) {
      sessionsRef.current = new Map(sessionsRef.current).set(normalized, session);
      setSessions(sessionsRef.current);
    }
    return runtime;
  }, []);

  const getExistingRuntime = useCallback(
    (parentChatId: string): BTWRuntime | null => {
      const normalized = String(parentChatId || "").trim();
      if (!normalized || !sessionsRef.current.has(normalized)) return null;
      return getRuntime(normalized);
    },
    [getRuntime],
  );

  const handleEvent = useCallback(
    (runtime: BTWRuntime, generation: number, event: AgentEvent) => {
      if (!isCurrentRuntime(runtime, generation)) return;
      const type = toText(event.type);
      const record = event as Record<string, unknown>;
      const eventBTWID = toText(record.btwId);
      if (eventBTWID) runtime.session.btwId = eventBTWID;
      if (event.runId) runtime.session.runId = toText(event.runId);
      if (event.requestId) runtime.session.requestId = toText(event.requestId);
      const eventTeamId = readEventTeamId(event);
      if (eventTeamId && !runtime.session.owner) {
        runtime.session.owner = { kind: "orchestrated-team", teamId: eventTeamId };
        runtime.session.agentKey = "";
      } else if (event.agentKey && runtime.session.owner?.kind !== "orchestrated-team") {
        runtime.session.agentKey = toText(event.agentKey);
        runtime.session.owner = runtime.session.owner || toRunOwner({ agentKey: event.agentKey }) || undefined;
      }
      if (
        runtime.session.status === "running" &&
        runtime.session.runId &&
        runtime.session.owner
      ) {
        runtime.session.interruptReady = true;
      }
      const seq = Number(record.seq);
      if (Number.isFinite(seq) && seq > runtime.session.lastSeq) {
        runtime.session.lastSeq = seq;
      }

      runtime.session.projection = appReducer(runtime.session.projection, {
        type: "PUSH_EVENT",
        event,
      });
      const commands = processStreamEvent(
        event,
        createLiveProcessorState(runtime.cache, runtime.session.projection),
        { mode: "live", reasoningExpandedDefault: false },
      );
      for (const command of commands) {
        applyLiveEventCommand({
          command,
          cache: runtime.cache,
          state: runtime.session.projection,
          dispatch: (action) => {
            runtime.session.projection = appReducer(
              runtime.session.projection,
              action,
            );
          },
        });
      }

      if (type === "usage.snapshot") {
        runtime.session.usage = event as BTWSessionState["usage"];
      } else if (type === "run.complete" || type === "run.cancel") {
        runtime.session.status = "idle";
        runtime.session.error = "";
        runtime.session.interruptReady = false;
        runtime.session.interruptPending = false;
      } else if (type === "run.error") {
        runtime.session.status = "error";
        runtime.session.error = formatPlatformErrorForDisplay(event).message;
        runtime.session.interruptReady = false;
        runtime.session.interruptPending = false;
      }
      publish(runtime);
    },
    [isCurrentRuntime, publish],
  );

  const buildStreamDispatch = useCallback(
    (runtime: BTWRuntime, generation: number): React.Dispatch<AppAction> =>
      (action) => {
        if (!isCurrentRuntime(runtime, generation)) return;
        if (action.type === "SET_REQUEST_ID") {
          runtime.session.requestId = action.requestId;
        } else if (action.type === "SET_STREAMING") {
          if (action.streaming) {
            runtime.session.status = "running";
          } else if (runtime.session.status === "running") {
            runtime.session.status = "idle";
            runtime.session.interruptReady = false;
            runtime.session.interruptPending = false;
          }
        } else if (action.type === "SET_ABORT_CONTROLLER") {
          runtime.session.projection = appReducer(runtime.session.projection, action);
        }
        publish(runtime);
      },
    [isCurrentRuntime, publish],
  );

  const sendBTW = useCallback(
    async (
      parentChatId: string,
      explicitMessage?: string,
      options: OpenBTWOptions = {},
    ): Promise<boolean> => {
      const normalizedChatId = String(parentChatId || "").trim();
      if (!normalizedChatId) return false;
      const runtime = getRuntime(normalizedChatId);
      const message = String(explicitMessage ?? runtime.session.draft).trim();
      if (!message) return false;
      if (runtime.session.status === "running") {
        runtime.session.draft = message;
        runtime.session.focusToken += 1;
        publish(runtime);
        return false;
      }

      runtime.session.config = {
        ...runtime.session.config,
        ...(options.accessLevel ? { accessLevel: options.accessLevel } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.params ? { params: options.params } : {}),
      };
      runtime.session.error = "";
      runtime.session.status = "running";
      runtime.session.interruptReady = false;
      runtime.session.interruptPending = false;
      runtime.session.draft = "";
      runtime.session.focusToken += 1;
      runtime.session.requestId = createRequestId("req");
      runtime.session.runId = createRequestId("run");
      runtime.session.lastSeq = 0;
      runtime.session.owner = resolveRunOwner({
        chatId: normalizedChatId,
        chats: stateRef.current.chats,
        sessionOwner: runtime.session.owner,
        fallbackOwner: toRunOwner({ agentKey: runtime.session.agentKey }),
      }) || undefined;
      runtime.session.agentKey = runtime.session.owner?.kind === "agent"
        ? runtime.session.owner.agentKey
        : "";
      runtime.generation += 1;
      const generation = runtime.generation;

      const nodeId = `btw_user_${runtime.session.requestId}`;
      const node: TimelineNode = {
        id: nodeId,
        kind: "message",
        role: "user",
        text: message,
        attachments: options.attachments,
        ts: Date.now(),
      };
      runtime.session.projection = appReducer(runtime.session.projection, {
        type: "SET_TIMELINE_NODE",
        id: nodeId,
        node,
      });
      runtime.session.projection = appReducer(runtime.session.projection, {
        type: "APPEND_TIMELINE_ORDER",
        id: nodeId,
      });
      runtime.cache = createLocalCacheFromState(runtime.session.projection);
      publish(runtime);

      const params: BTWStreamParams = {
        requestId: runtime.session.requestId,
        runId: runtime.session.runId,
        chatId: normalizedChatId,
        btwId: runtime.session.btwId || undefined,
        message,
        references:
          options.references && options.references.length > 0
            ? options.references
            : undefined,
        accessLevel: runtime.session.config.accessLevel,
        model: runtime.session.config.model,
        params:
          runtime.session.config.params &&
          Object.keys(runtime.session.config.params).length > 0
            ? runtime.session.config.params
            : undefined,
        stream: true,
      };
      try {
        await executeBTWStreamSse({
          params,
          dispatch: buildStreamDispatch(runtime, generation),
          handleEvent: (event) => handleEvent(runtime, generation, event),
          onIdentity: (identity) => {
            if (!isCurrentRuntime(runtime, generation)) return;
            if (identity.btwId) runtime.session.btwId = identity.btwId;
            if (identity.runId) runtime.session.runId = identity.runId;
            runtime.session.interruptReady = Boolean(
              identity.runId && runtime.session.owner,
            );
            publish(runtime);
          },
        });
      } catch (error) {
        if (!isCurrentRuntime(runtime, generation)) return true;
        const display = formatPlatformErrorForDisplay(error);
        runtime.session.status = "error";
        runtime.session.error = display.message;
        runtime.session.interruptReady = false;
        runtime.session.interruptPending = false;
        appendSystemError(runtime, display.message);
        publish(runtime);
      } finally {
        if (
          isCurrentRuntime(runtime, generation) &&
          runtime.session.status === "running"
        ) {
          runtime.session.status = "idle";
          runtime.session.interruptReady = false;
          runtime.session.interruptPending = false;
          publish(runtime);
        }
      }
      return true;
    },
    [
      buildStreamDispatch,
      getRuntime,
      handleEvent,
      isCurrentRuntime,
      publish,
      stateRef,
    ],
  );

  const openBTW = useCallback(
    (options: OpenBTWOptions = {}): boolean => {
      const parentChatId = String(
        options.parentChatId || stateRef.current.chatId || "",
      ).trim();
      if (!parentChatId) return false;
      const runtime = getRuntime(parentChatId);
      runtime.session.config = {
        ...runtime.session.config,
        ...(options.accessLevel ? { accessLevel: options.accessLevel } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.params ? { params: options.params } : {}),
      };
      runtime.session.focusToken += 1;
      if (options.message && runtime.session.status === "running") {
        runtime.session.draft = options.message;
      }
      publish(runtime);
      appDispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "btw" });
      if (options.sendImmediately && options.message) {
        void sendBTW(parentChatId, options.message, options);
      }
      return true;
    },
    [appDispatch, getRuntime, publish, sendBTW, stateRef],
  );

  const setDraft = useCallback(
    (parentChatId: string, draft: string) => {
      const runtime = getExistingRuntime(parentChatId);
      if (!runtime) return;
      runtime.session.draft = draft;
      publish(runtime);
    },
    [getExistingRuntime, publish],
  );

  const patchTimelineNode = useCallback(
    (parentChatId: string, node: TimelineNode) => {
      const runtime = getExistingRuntime(parentChatId);
      if (!runtime) return;
      runtime.session.projection = appReducer(runtime.session.projection, {
        type: "SET_TIMELINE_NODE",
        id: node.id,
        node,
      });
      runtime.cache = createLocalCacheFromState(runtime.session.projection);
      publish(runtime);
    },
    [getExistingRuntime, publish],
  );

  const newBranch = useCallback(
    (parentChatId: string): boolean => {
      const normalized = String(parentChatId || "").trim();
      const runtime = getExistingRuntime(normalized);
      if (!runtime) return false;
      if (runtime.session.status === "running") return false;
      runtime.generation += 1;
      runtime.session = createSession(normalized);
      runtime.session.focusToken = 1;
      runtime.cache = createLocalCacheFromState(runtime.session.projection);
      publish(runtime);
      return true;
    },
    [getExistingRuntime, publish],
  );

  const discardBTW = useCallback((parentChatId: string): boolean => {
    const discarded = discardBTWSessionRegistry({
      parentChatId,
      sessions: sessionsRef.current,
      runtimes: runtimesRef.current,
      restoredRunIds: restoredRunIdsRef.current || new Set<string>(),
    });
    if (!discarded.removed) return false;
    // Deliberately do not abort or interrupt: the stale stream keeps draining,
    // while runtime identity guards prevent it from publishing again.
    const nextSessions = discarded.nextSessions;
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    persistBTWSessions(nextSessions.values());
    return true;
  }, []);

  const interruptBTW = useCallback(
    async (parentChatId: string): Promise<boolean> => {
      const runtime = getExistingRuntime(parentChatId);
      if (
        !runtime ||
        runtime.session.status !== "running" ||
        !runtime.session.runId ||
        !runtime.session.interruptReady ||
        runtime.session.interruptPending
      ) {
        return false;
      }
      const owner = resolveRunOwner({
        chatId: parentChatId,
        chats: stateRef.current.chats,
        sessionOwner: runtime.session.owner,
        fallbackOwner: toRunOwner({ agentKey: runtime.session.agentKey }),
      });
      if (!owner) return false;
      const generation = runtime.generation;
      const runId = runtime.session.runId;
      runtime.session.interruptPending = true;
      runtime.session.error = "";
      publish(runtime);
      try {
        const response = await interruptBTWRun({
          requestId: createRequestId("req"),
          chatId: parentChatId,
          runId,
          owner,
          message: "",
          planningMode: false,
        });
        const accepted = isAcceptedBTWInterrupt(response, runId);
        const settlement = settleBTWInterrupt({
          runtimes: runtimesRef.current,
          runtime,
          generation,
          runId,
          accepted,
        });
        if (!accepted) {
          if (settlement === "rejected") {
            const detail = String(
              response.data?.detail || response.data?.status || response.msg ||
                t("btw.interrupt.rejected"),
            );
            runtime.session.error = detail;
            appendSystemError(runtime, detail);
            publish(runtime);
          }
          return false;
        }
        if (settlement === "accepted") {
          publish(runtime);
        }
        return true;
      } catch (error) {
        const settlement = settleBTWInterrupt({
          runtimes: runtimesRef.current,
          runtime,
          generation,
          runId,
          accepted: false,
        });
        if (settlement === "rejected") {
          const display = formatPlatformErrorForDisplay(error);
          runtime.session.error = display.message;
          appendSystemError(runtime, display.message);
          publish(runtime);
        }
        return false;
      }
    },
    [getExistingRuntime, isCurrentRuntime, publish, stateRef],
  );

  useEffect(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      persistBTWSessions(sessionsRef.current.values());
    }, 250);
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [sessions]);

  useEffect(() => {
    for (const session of sessionsRef.current.values()) {
      if (
        session.status !== "running" ||
        !session.runId ||
        !restoredRunIdsRef.current?.has(session.runId)
      ) {
        continue;
      }
      const runtime = getRuntime(session.parentChatId);
      const owner = resolveRunOwner({
        chatId: session.parentChatId,
        chats: stateRef.current.chats,
        sessionOwner: session.owner,
        fallbackOwner: toRunOwner({ agentKey: session.agentKey }),
      });
      if (!owner) continue;
      if (
        !restoredRunIdsRef.current ||
        !claimRestoredBTWRun(restoredRunIdsRef.current, session)
      ) {
        continue;
      }
      runtime.session.owner = owner;
      runtime.session.agentKey = owner.kind === "agent" ? owner.agentKey : "";
      runtime.session.interruptReady = true;
      const generation = runtime.generation;
      const attachAbortController = new AbortController();
      runtime.session.projection = appReducer(runtime.session.projection, {
        type: "SET_ABORT_CONTROLLER",
        controller: attachAbortController,
      });
      publish(runtime);
      void executeAttachRunSse({
        params: {
          runId: session.runId,
          owner,
          lastSeq: 0,
          signal: attachAbortController.signal,
        },
        dispatch: buildStreamDispatch(runtime, generation),
        handleEvent: (event) => handleEvent(runtime, generation, event),
      })
        .catch((error) => {
          if (!isCurrentRuntime(runtime, generation)) return;
          const display = formatPlatformErrorForDisplay(error);
          runtime.session.status = "error";
          runtime.session.error = display.message;
          runtime.session.interruptReady = false;
          runtime.session.interruptPending = false;
          appendSystemError(runtime, display.message);
          publish(runtime);
        })
        .finally(() => {
          if (!isCurrentRuntime(runtime, generation)) return;
          runtime.session.projection = appReducer(runtime.session.projection, {
            type: "SET_ABORT_CONTROLLER",
            controller: null,
          });
          if (runtime.session.status === "running") {
            runtime.session.status = "idle";
            runtime.session.interruptReady = false;
            runtime.session.interruptPending = false;
            publish(runtime);
          } else {
            publish(runtime);
          }
        });
    }
  }, [
    buildStreamDispatch,
    getRuntime,
    handleEvent,
    isCurrentRuntime,
    publish,
    sessions,
    stateRef,
    stateRef.current.chatAgentById,
  ]);

  const value = useMemo<BTWContextValue>(
    () => ({
      sessions,
      getSession: (parentChatId) => {
        const chatId = String(parentChatId || stateRef.current.chatId || "").trim();
        return chatId ? sessionsRef.current.get(chatId) || null : null;
      },
      openBTW,
      sendBTW,
      setDraft,
      patchTimelineNode,
      newBranch,
      discardBTW,
      interruptBTW,
    }),
    [
      discardBTW,
      interruptBTW,
      newBranch,
      openBTW,
      patchTimelineNode,
      sendBTW,
      sessions,
      setDraft,
      stateRef,
    ],
  );

  return <BTWContext.Provider value={value}>{children}</BTWContext.Provider>;
};

export function useBTW(): BTWContextValue {
  const context = useContext(BTWContext);
  if (!context) {
    throw new Error("useBTW must be used within BtwProvider");
  }
  return context;
}

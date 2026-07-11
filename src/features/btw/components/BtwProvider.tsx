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
import {
  resolvePreferredAgentKey,
  resolvePreferredTeamId,
} from "@/features/composer/lib/queryRouting";
import {
  createRequestId,
  interruptChat,
  type BTWStreamParams,
} from "@/shared/data";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { toText } from "@/shared/utils/eventUtils";
import {
  persistBTWSessions,
  readPersistedBTWSessions,
} from "@/features/btw/lib/btwPersistence";
import type {
  BTWSessionState,
  OpenBTWOptions,
  PersistedBTWSession,
} from "@/features/btw/lib/btwTypes";

interface BTWRuntime {
  session: BTWSessionState;
  cache: LocalCache;
}

interface BTWContextValue {
  sessions: Map<string, BTWSessionState>;
  getSession: (parentChatId?: string) => BTWSessionState | null;
  openBTW: (options?: OpenBTWOptions) => boolean;
  sendBTW: (parentChatId: string, message?: string, options?: OpenBTWOptions) => Promise<boolean>;
  setDraft: (parentChatId: string, draft: string) => void;
  patchTimelineNode: (parentChatId: string, node: TimelineNode) => void;
  newBranch: (parentChatId: string) => boolean;
  interruptBTW: (parentChatId: string) => Promise<void>;
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
  return {
    parentChatId,
    btwId: persisted?.btwId || "",
    runId: persisted?.runId || "",
    requestId: persisted?.requestId || "",
    agentKey: persisted?.agentKey || "",
    status: persisted?.status || "idle",
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
  const initialSessionsRef = useRef<Map<string, BTWSessionState> | null>(null);
  if (!initialSessionsRef.current) {
    initialSessionsRef.current = new Map(
      readPersistedBTWSessions().map((item) => [
        item.parentChatId,
        createSession(item.parentChatId, item),
      ]),
    );
  }
  const [sessions, setSessions] = useState(initialSessionsRef.current);
  const sessionsRef = useRef(sessions);
  const runtimesRef = useRef(new Map<string, BTWRuntime>());
  const attachedRunsRef = useRef(new Set<string>());
  sessionsRef.current = sessions;

  const publish = useCallback((runtime: BTWRuntime) => {
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
  }, []);

  const getRuntime = useCallback((parentChatId: string): BTWRuntime => {
    const normalized = String(parentChatId || "").trim();
    const existing = runtimesRef.current.get(normalized);
    if (existing) return existing;
    const session = sessionsRef.current.get(normalized) || createSession(normalized);
    const runtime = {
      session,
      cache: createLocalCacheFromState(session.projection),
    };
    runtimesRef.current.set(normalized, runtime);
    if (!sessionsRef.current.has(normalized)) {
      sessionsRef.current = new Map(sessionsRef.current).set(normalized, session);
      setSessions(sessionsRef.current);
    }
    return runtime;
  }, []);

  const handleEvent = useCallback(
    (runtime: BTWRuntime, event: AgentEvent) => {
      const type = toText(event.type);
      const record = event as Record<string, unknown>;
      const eventBTWID = toText(record.btwId);
      if (eventBTWID) runtime.session.btwId = eventBTWID;
      if (event.runId) runtime.session.runId = toText(event.runId);
      if (event.requestId) runtime.session.requestId = toText(event.requestId);
      if (event.agentKey) runtime.session.agentKey = toText(event.agentKey);
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
      } else if (type === "run.error") {
        runtime.session.status = "error";
        runtime.session.error = formatPlatformErrorForDisplay(event).message;
      }
      publish(runtime);
    },
    [publish],
  );

  const buildStreamDispatch = useCallback(
    (runtime: BTWRuntime): React.Dispatch<AppAction> =>
      (action) => {
        if (action.type === "SET_REQUEST_ID") {
          runtime.session.requestId = action.requestId;
        } else if (action.type === "SET_STREAMING") {
          if (action.streaming) {
            runtime.session.status = "running";
          } else if (runtime.session.status === "running") {
            runtime.session.status = "idle";
          }
        } else if (action.type === "SET_ABORT_CONTROLLER") {
          runtime.session.projection = appReducer(runtime.session.projection, action);
        }
        publish(runtime);
      },
    [publish],
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
      runtime.session.draft = "";
      runtime.session.focusToken += 1;
      runtime.session.requestId = createRequestId("req");
      runtime.session.runId = createRequestId("run");
      runtime.session.lastSeq = 0;
      runtime.session.agentKey =
        runtime.session.agentKey ||
        resolvePreferredAgentKey(stateRef.current, { chatId: normalizedChatId });

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
          dispatch: buildStreamDispatch(runtime),
          handleEvent: (event) => handleEvent(runtime, event),
          onIdentity: (identity) => {
            if (identity.btwId) runtime.session.btwId = identity.btwId;
            if (identity.runId) runtime.session.runId = identity.runId;
            publish(runtime);
          },
        });
      } catch (error) {
        const display = formatPlatformErrorForDisplay(error);
        runtime.session.status = "error";
        runtime.session.error = display.message;
        appendSystemError(runtime, display.message);
        publish(runtime);
      } finally {
        if (runtime.session.status === "running") {
          runtime.session.status = "idle";
          publish(runtime);
        }
      }
      return true;
    },
    [buildStreamDispatch, getRuntime, handleEvent, publish, stateRef],
  );

  const openBTW = useCallback(
    (options: OpenBTWOptions = {}): boolean => {
      const parentChatId = String(
        options.parentChatId || stateRef.current.chatId || "",
      ).trim();
      if (!parentChatId) return false;
      appDispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "btw" });
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
      if (options.sendImmediately && options.message) {
        void sendBTW(parentChatId, options.message, options);
      }
      return true;
    },
    [appDispatch, getRuntime, publish, sendBTW, stateRef],
  );

  const setDraft = useCallback(
    (parentChatId: string, draft: string) => {
      const runtime = getRuntime(parentChatId);
      runtime.session.draft = draft;
      publish(runtime);
    },
    [getRuntime, publish],
  );

  const patchTimelineNode = useCallback(
    (parentChatId: string, node: TimelineNode) => {
      const runtime = getRuntime(parentChatId);
      runtime.session.projection = appReducer(runtime.session.projection, {
        type: "SET_TIMELINE_NODE",
        id: node.id,
        node,
      });
      runtime.cache = createLocalCacheFromState(runtime.session.projection);
      publish(runtime);
    },
    [getRuntime, publish],
  );

  const newBranch = useCallback(
    (parentChatId: string): boolean => {
      const runtime = getRuntime(parentChatId);
      if (runtime.session.status === "running") return false;
      runtime.session = createSession(parentChatId);
      runtime.session.focusToken = 1;
      runtime.cache = createLocalCacheFromState(runtime.session.projection);
      publish(runtime);
      return true;
    },
    [getRuntime, publish],
  );

  const interruptBTW = useCallback(
    async (parentChatId: string): Promise<void> => {
      const runtime = getRuntime(parentChatId);
      if (runtime.session.status !== "running" || !runtime.session.runId) return;
      const agentKey =
        runtime.session.agentKey ||
        resolvePreferredAgentKey(stateRef.current, { chatId: parentChatId });
      const teamId = resolvePreferredTeamId(stateRef.current, {
        chatId: parentChatId,
      });
      if (!agentKey) return;
      try {
        await interruptChat({
          requestId: createRequestId("req"),
          chatId: parentChatId,
          runId: runtime.session.runId,
          agentKey,
          teamId: teamId || undefined,
          message: "",
          planningMode: false,
        });
      } catch (error) {
        const display = formatPlatformErrorForDisplay(error);
        runtime.session.error = display.message;
        appendSystemError(runtime, display.message);
      } finally {
        runtime.session.projection.abortController?.abort();
        runtime.session.status = "idle";
        publish(runtime);
      }
    },
    [getRuntime, publish, stateRef],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      persistBTWSessions(sessions.values());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [sessions]);

  useEffect(() => {
    for (const session of sessionsRef.current.values()) {
      if (
        session.status !== "running" ||
        !session.runId ||
        attachedRunsRef.current.has(session.runId)
      ) {
        continue;
      }
      const runtime = getRuntime(session.parentChatId);
      const agentKey =
        session.agentKey ||
        resolvePreferredAgentKey(stateRef.current, {
          chatId: session.parentChatId,
        });
      if (!agentKey) continue;
      runtime.session.agentKey = agentKey;
      attachedRunsRef.current.add(session.runId);
      void executeAttachRunSse({
        params: {
          runId: session.runId,
          agentKey,
          lastSeq: 0,
        },
        dispatch: buildStreamDispatch(runtime),
        handleEvent: (event) => handleEvent(runtime, event),
      })
        .catch((error) => {
          const display = formatPlatformErrorForDisplay(error);
          runtime.session.status = "error";
          runtime.session.error = display.message;
          appendSystemError(runtime, display.message);
          publish(runtime);
        })
        .finally(() => {
          if (runtime.session.status === "running") {
            runtime.session.status = "idle";
            publish(runtime);
          }
        });
    }
  }, [
    buildStreamDispatch,
    getRuntime,
    handleEvent,
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
        return chatId ? sessions.get(chatId) || null : null;
      },
      openBTW,
      sendBTW,
      setDraft,
      patchTimelineNode,
      newBranch,
      interruptBTW,
    }),
    [
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

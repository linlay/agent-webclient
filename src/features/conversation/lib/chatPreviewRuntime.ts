import { getChat, type ChatDetailResponse } from "@/shared/data";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { RunOwner } from "@/shared/data/runOwner";
import type { RealtimeConnectionStatus, RealtimeTransport, RunExecution, PushFrame } from "@/features/transport/contracts/realtimeTransport";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import { buildChatReplayProjection, type ChatReplayProjection } from "./chatReplayProjection";
import { applyReadOnlyStreamEvent } from "./conversationReplay";
import { chatSurfaceReplayErrorCode, classifyChatSurfaceEvent, cloneReplayState, lastSeqForRun, normalizedSeq, resolveChatSurfaceOwner } from "./chatSurfaceReplay";
import { hasValidDesktopPushTimeContract } from "@/shared/utils/platformTime";
import { t } from "@/shared/i18n/runtime";

export interface ChatPreviewSnapshot {
  chat: ChatDetailResponse;
  projection: ChatReplayProjection;
  owner: RunOwner | null;
}
export interface ChatPreviewState {
  snapshot: ChatPreviewSnapshot | null;
  loading: boolean;
  error: string;
  connection: RealtimeConnectionStatus;
  active: boolean;
}

const terminalTypes = new Set(["run.complete", "run.error", "run.cancel"]);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Owns only this reader's snapshot and observer. Never owns or controls the Run. */
export function createChatPreviewRuntime(input: {
  chatId: string;
  live: boolean;
  transport: RealtimeTransport;
  active?: boolean;
  onChange: (state: ChatPreviewState) => void;
}) {
  const { chatId, live, transport } = input;
  let state: ChatPreviewState = {
    snapshot: null, loading: true, error: "", connection: transport.getStatus(), active: input.active !== false,
  };
  let disposed = false;
  let loadEpoch = 0;
  let bindingEpoch = 0;
  let execution: RunExecution | null = null;
  let unsubscribePush: (() => void) | undefined;
  const recoveredRuns = new Set<string>();
  const notifiedRuns = new Set<string>();
  let pendingRun = "";
  let reconnectPending = false;
  let hasConnected = state.connection === "connected";

  const publish = (patch: Partial<ChatPreviewState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    input.onChange(state);
  };
  const detach = () => {
    ++bindingEpoch;
    const previous = execution;
    execution = null;
    if (previous) void previous.detach().catch(() => undefined);
  };
  const showError = (cause: unknown) => {
    const code = chatSurfaceReplayErrorCode(cause);
    publish({ loading: false, error: code === "seq_expired" || code === "replay_required"
      ? t("surface.replayExpired") : cause instanceof Error ? cause.message : String(cause) });
  };
  const failStream = (cause: unknown, runId: string, epoch: number) => {
    if (disposed || !state.active || epoch !== bindingEpoch) return;
    detach();
    const code = chatSurfaceReplayErrorCode(cause);
    if (code === "WS_DISCONNECTED" && transport.kind === "standalone") {
      reconnectPending = true;
      publish({ connection: "reconnecting" });
      // Connection can have recovered before this Promise callback runs.
      if (transport.getStatus() === "connected") { reconnectPending = false; void load(); }
      return;
    }
    if ((code === "seq_expired" || code === "replay_required") && !recoveredRuns.has(runId)) {
      recoveredRuns.add(runId);
      void load();
      return;
    }
    showError(cause);
  };

  const subscribe = (snapshot: ChatPreviewSnapshot) => {
    const activeRun = snapshot.chat.activeRun;
    const runId = String(activeRun?.runId || "").trim();
    if (!live || !state.active || !runId) return;
    if (!snapshot.owner) {
      showError(new Error(t("chatPreview.ownerMissing")));
      return;
    }
    const epoch = ++bindingEpoch;
    let lastSeq = Math.max(lastSeqForRun(snapshot.projection.events, runId), normalizedSeq(activeRun?.lastSeq));
    let sawTerminal = false;
    try {
      const current = transport.runs.subscribe({
        chatId, runId, owner: snapshot.owner, lastSeq,
        onEvent: (event: AgentEvent) => {
          if (disposed || !state.active || epoch !== bindingEpoch) return;
          const decision = classifyChatSurfaceEvent({ event, chatId, runId, lastSeq });
          if (decision.action === "ignore") return;
          if (decision.action === "reload") {
            failStream(new RealtimeTransportError("replay_required", "Run sequence gap"), runId, epoch);
            return;
          }
          lastSeq = decision.nextSeq;
          const previous = state.snapshot;
          if (!previous) return;
          const projectionState = cloneReplayState(previous.projection.state);
          applyReadOnlyStreamEvent(projectionState, event);
          sawTerminal = terminalTypes.has(event.type);
          const chat = sawTerminal
            ? { ...previous.chat, activeRun: null, hasActiveRun: false, awaiting: null }
            : previous.chat;
          publish({ snapshot: {
            ...previous, chat,
            projection: { ...previous.projection, state: projectionState, events: projectionState.events },
          } });
          if (sawTerminal) detach();
        },
      });
      // A transport may synchronously emit a terminal or recovery event during subscribe.
      if (epoch === bindingEpoch) execution = current;
      else void current.detach().catch(() => undefined);
      void current.identity.catch(cause => failStream(cause, runId, epoch));
      void current.completion.then(completion => {
        if (disposed || epoch !== bindingEpoch || !state.active) return;
        if (completion.error) { failStream(completion.error, runId, epoch); return; }
        detach();
        if (!sawTerminal) {
          // Stream completion alone is not a protocol Run terminal; reconcile once.
          if (!recoveredRuns.has(runId)) { recoveredRuns.add(runId); void load(); }
          else showError(new Error(t("chatPreview.streamEnded")));
        }
      }, cause => failStream(cause, runId, epoch));
    } catch (cause) { failStream(cause, runId, epoch); }
  };

  async function load() {
    if (disposed || !state.active) return;
    const epoch = ++loadEpoch;
    detach();
    publish({ loading: true, error: "" });
    try {
      if (!chatId) throw new Error(t("platformError.code.invalid_request"));
      const response = await getChat(chatId, false);
      if (disposed || epoch !== loadEpoch || !state.active) return;
      const chat = response.data;
      if (String(chat.chatId || "").trim() !== chatId) throw new Error(t("chatPreview.identityMismatch"));
      const projection = buildChatReplayProjection(chatId, chat);
      const snapshot = { chat, projection, owner: resolveChatSurfaceOwner(chat, chat.activeRun || null) };
      publish({ snapshot, loading: false });
      if (pendingRun) {
        const runId = pendingRun;
        pendingRun = "";
        const included = chat.activeRun?.runId === runId || projection.events.some(event => event.runId === runId);
        if (!included) { void load(); return; }
      }
      subscribe(snapshot);
    } catch (cause) {
      if (disposed || epoch !== loadEpoch || !state.active) return;
      showError(cause);
    }
  }

  const onPush = (frame: PushFrame) => {
    if (disposed || !state.active || state.error) return;
    const value = { ...record(frame.payload || frame.data), ...frame };
    if (!hasValidDesktopPushTimeContract({ type: value.type, event: value, frame })) return;
    if (String(value.chatId || "") !== chatId) return;
    const runId = String(value.runId || value.lastRunId || "").trim();
    if (!runId || notifiedRuns.has(runId)) return;
    if (state.snapshot?.chat.activeRun?.runId === runId || state.snapshot?.projection.events.some(event => event.runId === runId)) return;
    notifiedRuns.add(runId);
    if (state.loading) pendingRun = runId;
    else void load();
  };
  const observePush = () => {
    if (live && state.active && !unsubscribePush) unsubscribePush = transport.push.subscribe({
      types: ["run.started", "run.finished", "chat.unread"], chatId,
    }, onPush);
  };
  observePush();
  const unsubscribeStatus = live ? transport.subscribeStatus(connection => {
    const previous = state.connection;
    publish({ connection });
    if (connection === "connected") {
      const needsReplay = hasConnected && previous !== "connected" &&
        (transport.kind === "standalone" || !execution);
      hasConnected = true;
      if (state.active && !state.loading && (needsReplay || reconnectPending) && !state.error) {
        reconnectPending = false;
        void load();
      }
    }
  }) : undefined;
  void load();

  return {
    reload() {
      recoveredRuns.clear();
      notifiedRuns.clear();
      pendingRun = "";
      void load();
    },
    setActive(active: boolean) {
      if (disposed || active === state.active) return;
      publish({ active });
      if (!active) {
        ++loadEpoch;
        detach();
        unsubscribePush?.();
        unsubscribePush = undefined;
      } else {
        recoveredRuns.clear();
        notifiedRuns.clear();
        observePush();
        if (live || !state.snapshot) void load();
      }
    },
    dispose() {
      disposed = true;
      ++loadEpoch;
      detach();
      unsubscribePush?.();
      unsubscribeStatus?.();
    },
  };
}

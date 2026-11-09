import { isDesktopAppMode } from "@/shared/utils/routing";

declare const __WEBCLIENT_BUILD__: { version: string; commit: string; builtAt: string; id: string };

export type VoiceTimingStage = "listenStart" | "manualStop" | "asrFinalReceived" | "runStartReceived" | "runEndReceived"
  | "speechStartReceived" | "playStart" | "speechCandidate" | "speechDetected" | "interruptRequested" | "localSilenced" | "turnEnd";
export type VoiceTimingPoint = {
  sessionId: string; turn: number; stage: VoiceTimingStage; atMs: number;
  mode?: "button" | "duplex";
  runId?: string; awaitingId?: string; speechId?: string; purpose?: "final" | "question" | "notice";
  outcome?: "complete" | "empty" | "error" | "aborted" | "superseded" | "closed";
  clockSource?: "output_timestamp" | "context_clock";
};

// No retained buffer, network upload, body, token, or recording. An explicitly
// installed probe consumes these metadata-only events on this page.
export function emitVoiceTiming(point: VoiceTimingPoint): void {
  if (!point.sessionId || !Number.isFinite(point.atMs) || point.atMs < 0) return;
  window.dispatchEvent(new CustomEvent("agent:voice-timing", { detail: Object.freeze({
    ...point, category: "voice.timing", clock: "client_performance", timeOrigin: performance.timeOrigin,
    build: typeof __WEBCLIENT_BUILD__ === "undefined" ? "unknown" : __WEBCLIENT_BUILD__.id,
    host: isDesktopAppMode() ? "desktop" : "web", mode: point.mode || "button", codec: "pcm_s16le",
  }) }));
}

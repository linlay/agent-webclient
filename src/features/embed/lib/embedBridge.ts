import { setEmbedContext } from "@/shared/data/embed/hostContext";
import { embedAllowedOrigins, isEmbedEnabled } from "@/shared/config/embed";
import { clearEmbedSession, installEmbedRefresh, setEmbedOptions, setEmbedToken, validateEmbedToken, type EmbedOptions, type EmbedToken } from "@/shared/data/embed/embedSession";

export interface EmbedMessage {
  version: 1;
  instanceId: string;
  sessionId: string;
  type: string;
  requestId?: string;
  payload?: unknown;
}
export type EmbedCommandHandler = (type: string, payload: unknown) => Promise<unknown>;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export function parseEmbedOptions(value: unknown): EmbedOptions {
  if (!record(value)) throw new Error("invalid_init");
  if (value.chatId != null && (typeof value.chatId !== "string" || value.chatId.length > 256)) throw new Error("invalid_chat");
  if (value.theme != null && !["light", "dark", "system"].includes(String(value.theme))) throw new Error("invalid_theme");
  if (value.locale != null && !["zh-CN", "en-US"].includes(String(value.locale))) throw new Error("invalid_locale");
  if (value.features != null && !record(value.features)) throw new Error("invalid_features");
  const features = record(value.features) ? value.features : {};
  for (const key of ["history", "attachments", "newChat"]) {
    if (features[key] != null && typeof features[key] !== "boolean") throw new Error("invalid_features");
  }
  return { chatId: value.chatId as string | undefined, theme: value.theme as EmbedOptions["theme"], locale: value.locale as EmbedOptions["locale"],
    features: { history: features.history === true, attachments: features.attachments === true, newChat: features.newChat === true } };
}

/** No business data or token is sent over window.postMessage. The transferred port is the capability. */
export function startEmbedBridge(input: {
  onInit: (options: EmbedOptions) => void;
  onError: (code: string) => void;
}): () => void {
  const query = new URLSearchParams(window.location.search);
  const instanceId = query.get("embedId") || "";
  const parentOrigin = query.get("parentOrigin") || "";
  if (!isEmbedEnabled() || !embedAllowedOrigins().includes(parentOrigin) || !/^[a-zA-Z0-9_-]{1,128}$/.test(instanceId) || window.parent === window) {
    input.onError("embed_not_allowed");
    return () => undefined;
  }
  const sessionId = crypto.randomUUID();
  let port: MessagePort | null = null;
  let initialized = false;
  let closed = false;
  let refreshId = "";
  let refreshWaiter: { resolve: (token: EmbedToken) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  const seen = new Set<string>();
  const send = (type: string, payload: unknown = {}, requestId?: string) => {
    if (!closed) port?.postMessage({ version: 1, instanceId, sessionId, type, payload, ...(requestId ? { requestId } : {}) });
  };
  const refresh = () => new Promise<EmbedToken>((resolve, reject) => {
    refreshId = crypto.randomUUID();
    refreshWaiter = { resolve, reject, timer: setTimeout(() => {
      refreshWaiter = null;
      send("auth.required");
      reject(new Error("auth_timeout"));
    }, 15_000) };
    send("auth.refresh", {}, refreshId);
  });
  const onConnect = (event: MessageEvent) => {
    const message = event.data as EmbedMessage;
    if (closed || port || event.source !== window.parent || event.origin !== parentOrigin ||
        !record(message) || message.version !== 1 || message.type !== "connect" || message.instanceId !== instanceId || message.sessionId !== sessionId || event.ports.length !== 1) return;
    port = event.ports[0];
    port.onmessage = async event => {
      const msg = event.data as EmbedMessage;
      if (closed || !record(msg) || msg.version !== 1 || msg.instanceId !== instanceId || msg.sessionId !== sessionId || typeof msg.type !== "string") return;
      if (msg.type === "auth.token" && initialized && msg.requestId === refreshId && refreshWaiter) {
        const waiter = refreshWaiter;
        refreshWaiter = null;
        clearTimeout(waiter.timer);
        try { waiter.resolve(validateEmbedToken(msg.payload)); } catch { waiter.reject(new Error("auth_required")); send("auth.required"); }
        return;
      }
      if (msg.type === "auth.failed" && !initialized) { input.onError("auth_required"); send("auth.required"); return; }
      if (!msg.requestId || typeof msg.requestId !== "string" || msg.requestId.length > 128 || seen.has(msg.requestId)) return;
      if (seen.size >= 4096) { send("response", { ok: false, code: "session_limit" }, msg.requestId); return; }
      seen.add(msg.requestId);
      try {
        if (msg.type === "init") {
          if (initialized || !record(msg.payload)) throw new Error("already_initialized");
          const options = parseEmbedOptions(msg.payload);
          const token = validateEmbedToken(msg.payload.credential);
          setEmbedContext(msg.payload.context);
          setEmbedToken(token);
          setEmbedOptions(options);
          installEmbedRefresh(refresh);
          initialized = true;
          input.onInit(options);
          send("response", { ok: true }, msg.requestId);
        } else {
          if (!initialized) throw new Error("not_initialized");
          // Runtime responds via a callback; no new backend protocol fields are introduced.
          const result = await new Promise<unknown>((resolve, reject) => {
            const detail = { type: msg.type, payload: msg.payload, resolve, reject, handled: false };
            window.dispatchEvent(new CustomEvent("agent:embed-command", { detail }));
            if (!detail.handled) reject(new Error("not_ready"));
          });
          send("response", { ok: true, result }, msg.requestId);
        }
      } catch (error) {
        send("response", { ok: false, code: error instanceof Error ? error.message : "command_failed" }, msg.requestId);
      }
    };
    port.start();
    send("connected");
  };
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (initialized && record(detail) && typeof detail.type === "string") send(detail.type, detail.payload);
  };
  window.addEventListener("message", onConnect);
  window.addEventListener("agent:embed-event", onEvent);
  window.parent.postMessage({ version: 1, instanceId, sessionId, type: "hello" }, parentOrigin);
  const helloTimer = setInterval(() => {
    if (!port) window.parent.postMessage({ version: 1, instanceId, sessionId, type: "hello" }, parentOrigin);
  }, 500);
  const timeout = setTimeout(() => { if (!initialized) input.onError("embed_timeout"); }, 30_000);
  return () => {
    closed = true;
    clearInterval(helloTimer); clearTimeout(timeout);
    window.removeEventListener("message", onConnect);
    window.removeEventListener("agent:embed-event", onEvent);
    port?.close();
    if (refreshWaiter) { clearTimeout(refreshWaiter.timer); refreshWaiter.reject(new Error("session_closed")); }
    clearEmbedSession();
    setEmbedContext(null);
  };
}

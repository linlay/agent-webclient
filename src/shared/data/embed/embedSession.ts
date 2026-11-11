export interface EmbedToken { token: string; expiresAt: number }
export interface EmbedOptions {
  chatId?: string;
  theme?: "light" | "dark" | "system";
  locale?: "zh-CN" | "en-US";
  features?: { history?: boolean; attachments?: boolean; newChat?: boolean };
}
let credential: EmbedToken | null = null;
let refresh: (() => Promise<EmbedToken>) | null = null;
let pending: Promise<string> | null = null;
let generation = 0;
let options: EmbedOptions = {};
export function getEmbedSessionRevision(): number { return generation; }
export function getEmbedOptions(): EmbedOptions { return options; }
export function setEmbedOptions(value: EmbedOptions): void { options = value; }
export function validateEmbedToken(value: unknown): EmbedToken {
  const token = value as Partial<EmbedToken> | null;
  if (!token || typeof token.token !== "string" || !token.token.trim() || token.token.length > 16384 ||
      typeof token.expiresAt !== "number" || !Number.isFinite(token.expiresAt) || token.expiresAt <= Date.now()) {
    throw new Error("invalid_token");
  }
  return { token: token.token.trim(), expiresAt: token.expiresAt };
}
export function setEmbedToken(value: unknown): void { credential = validateEmbedToken(value); }
export function getEmbedToken(): string { return credential && credential.expiresAt > Date.now() ? credential.token : ""; }
export function installEmbedRefresh(handler: () => Promise<EmbedToken>): void { refresh = handler; }
export async function ensureEmbedToken(force = false): Promise<string> {
  if (pending) return pending;
  if (!force && credential && credential.expiresAt > Date.now() + 30_000) return credential.token;
  if (!refresh) throw new Error("auth_required");
  const revision = generation;
  pending = refresh().then(value => {
    if (revision !== generation) throw new Error("session_closed");
    setEmbedToken(value);
    emitEmbedEvent("auth.ready");
    return getEmbedToken();
  }).catch(error => {
    if (revision === generation) emitEmbedEvent("auth.required");
    throw error;
  }).finally(() => { if (revision === generation) pending = null; });
  return pending;
}
export function clearEmbedSession(): void { generation++; credential = null; refresh = null; pending = null; options = {}; }
export function emitEmbedEvent(type: string, payload: unknown = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("agent:embed-event", { detail: { type, payload } }));
}

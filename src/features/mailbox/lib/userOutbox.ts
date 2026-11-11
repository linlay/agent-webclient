import { getClientStorage } from "@/shared/utils/clientStorage";
import type { SendUserMessageRequest, SendUserMessageReceipt } from "@/shared/data/api/dto/mailbox";

export interface UserOutboxEntry {
  scope: string;
  request: SendUserMessageRequest;
  createdAt: number;
  mailId?: string;
  newChat?: boolean;
  delivery?: SendUserMessageReceipt["delivery"];
  ignoredOptions?: string[];
  undelivered?: boolean;
  uncertain?: boolean;
  error?: string;
}
const storageKey = "agent-webclient.user-outbox.v1";
export const userOutboxChanged = "agent:user-outbox-changed";
let entries: UserOutboxEntry[] | undefined;
const consumed = new Set<string>();
function key(scope: string, requestId: string): string { return `${scope}\0${requestId}`; }
function all(): UserOutboxEntry[] {
  if (entries) return entries;
  try {
    const value: unknown = JSON.parse(getClientStorage("local").getItem(storageKey) || "[]");
    entries = Array.isArray(value) ? value.filter((v): v is UserOutboxEntry =>
      Boolean(v && typeof v.scope === "string" && typeof v.request?.requestId === "string" && typeof v.request?.message === "string")) : [];
  } catch { entries = []; }
  return entries;
}
function publish(next: UserOutboxEntry[]): void {
  entries = next;
  try { getClientStorage("local").setItem(storageKey, JSON.stringify(next)); } catch { /* Keep drafts in memory when storage is unavailable. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(userOutboxChanged));
}
export function readUserOutbox(scope: string): UserOutboxEntry[] { return all().filter(entry => entry.scope === scope).sort((a, b) => a.createdAt - b.createdAt); }
export function putUserOutbox(entry: UserOutboxEntry): void {
  if (consumed.has(key(entry.scope, entry.request.requestId))) return;
  publish([...all().filter(value => key(value.scope, value.request.requestId) !== key(entry.scope, entry.request.requestId)), entry]);
}
export function updateUserOutbox(scope: string, requestId: string, patch: Partial<UserOutboxEntry>): void {
  publish(all().map(entry => key(entry.scope, entry.request.requestId) === key(scope, requestId) ? { ...entry, ...patch } : entry));
}
export function acceptUserOutbox(scope: string, requestId: string, receipt: SendUserMessageReceipt): void {
  const entry = readUserOutbox(scope).find(value => value.request.requestId === requestId);
  if (!entry) return;
  putUserOutbox({ ...entry, mailId: receipt.mailId, delivery: receipt.delivery, ignoredOptions: receipt.ignoredOptions, undelivered: false, uncertain: false, error: undefined, newChat: false,
    request: { ...entry.request, chatId: receipt.chatId, primary: undefined } });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("agent:mail-receipt", { detail: {
      mailId: receipt.mailId, toChatId: receipt.chatId, requestId,
      ignoredOptions: receipt.ignoredOptions,
    } }));
  }
}
/** Failed, discarded or withdrawn mail will never reach its Chat. */
export function isUndeliveredMailStatus(status: string | undefined): boolean {
  return status === "failed" || status === "discarded" || status === "withdrawn";
}
export function removeUserOutbox(scope: string, requestId: string): void {
  publish(all().filter(entry => key(entry.scope, entry.request.requestId) !== key(scope, requestId)));
}
export function consumeUserOutbox(scope: string, requestId: string): void {
  consumed.add(key(scope, requestId));
  removeUserOutbox(scope, requestId);
}

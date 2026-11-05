export interface MailUpdate {
  mailId: string;
  fromAgentKey?: string;
  toAgentKey?: string;
  fromChatId?: string;
  toChatId?: string;
}
export function readMailUpdate(event: Event): MailUpdate | undefined {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object" || !("mailId" in detail) || typeof detail.mailId !== "string") return undefined;
  return detail as MailUpdate;
}

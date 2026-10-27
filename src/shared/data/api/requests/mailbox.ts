import type { MailActionParams, MailListParams, MailRecord } from "../dto/mailbox";
import { dataEndpoints } from "../endpoints";
import { requestJson, postJson } from "../http";
export function getMails(params: MailListParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  return requestJson<{ mails: MailRecord[] }>(`${dataEndpoints.mails.path}?${query}`, { signal });
}
export function actOnMail(params: MailActionParams) {
  return postJson<MailRecord>(dataEndpoints.mailAction.path, params);
}

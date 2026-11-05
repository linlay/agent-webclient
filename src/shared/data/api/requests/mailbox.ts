import type { MailActionParams, MailListParams, MailRecord } from "../dto/mailbox";
import { dataEndpoints } from "../endpoints";
import { requestJson, postJson } from "../http";
export function getMails(params: MailListParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  return requestJson<{ mails: MailRecord[]; total: number }>(`${dataEndpoints.mails.path}?${query}`, { signal });
}
export function actOnMail(params: MailActionParams) {
  return postJson<MailRecord>(dataEndpoints.mailAction.path, params);
}

export function getMailDetail(mailId: string, signal?: AbortSignal) {
 return requestJson<MailRecord>(`${dataEndpoints.mailDetail.path}?${new URLSearchParams({mailId})}`, {signal});
}

export interface MailAskSubmission {
  runId: string;
  agentKey: string;
  awaitingId: string;
  params?: Record<string, unknown>[];
  param?: { decision: string; data?: Record<string, unknown> };
}
export function submitMailAsk(input: MailAskSubmission) {
  return postJson(dataEndpoints.submit.path, input);
}

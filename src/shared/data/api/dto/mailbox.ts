export type MailKind = "letter" | "reply" | "notify" | "ask";
export type MailStatus = "accepting" | "queued" | "inflight" | "delivered" | "done" | "failed" | "suspended" | "discarded" | "withdrawn";
export interface MailMetadata {
  id: string;
  kind: MailKind;
  outcome?: string;
  fromAgentKey: string;
  fromChatId: string;
}
export interface MailRecord {
  mailId: string;
  kind: MailKind;
  status: MailStatus;
  createdAt: number;
  toAgentKey: string;
  toChatId: string;
  fromAgentKey: string;
  fromChatId: string;
  fromRunId: string;
  message: string;
  accessLevel?: string;
  evidence?: "none" | "consumed" | "unknown";
  outcome?: string;
  purgedAt?: number;
  error?: { code?: string; message?: string };
  files?: { name: string; path: string; size: number }[];
}
export interface MailListParams { agentKey?: string; chatId?: string; kind?: MailKind; status?: MailStatus; limit?: number; offset?: number }
export interface MailActionParams { mailId: string; action: "redeliver" | "discard" }

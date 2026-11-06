export type MailBox = "pending" | "received" | "trash";
export type MailKind = "letter" | "reply" | "notify" | "ask";
export type MailStatus = "accepting" | "queued" | "inflight" | "delivered" | "done" | "failed" | "suspended" | "discarded" | "withdrawn";
export interface MailMetadata {
  id: string;
  kind: MailKind;
  outcome?: string;
  fromAgentKey: string;
  fromAgentName?: string;
  fromChatId: string;
}
export interface MailRecord {
  mailId: string;
  requestId?: string;
  originType?: string;
  delivery?: "started" | "inserted" | "queued";
  runId?: string;
  ignoredOptions?: string[];
  kind: MailKind;
  status: MailStatus;
  createdAt: number;
  toAgentKey: string;
  toChatId: string;
  fromAgentKey: string;
  fromAgentName?: string;
  fromChatId: string;
  fromRunId: string;
  message: string;
  accessLevel?: string;
  awaitingId?: string;
  awaitingMode?: string;
  awaitingSource?: string;
  evidence?: "none" | "consumed" | "unknown";
  outcome?: string;
  purgedAt?: number;
  error?: { code?: string; message?: string };
  files?: { name: string; path: string; size: number }[];
}
export interface MailListParams { box?: MailBox; agentKey?: string; chatId?: string; kind?: MailKind; status?: MailStatus; limit?: number; offset?: number }
export interface MailActionParams { mailId: string; action: "redeliver" | "discard" }

export interface SendUserMessageRequest {
  requestId: string;
  chatId?: string;
  agentKey?: string;
  primary?: boolean;
  message: string;
  references?: unknown[];
  planningMode?: boolean;
  editingMode?: boolean;
  model?: { key?: string; modelId?: string; reasoningEffort?: string; serviceTier?: string };
  accessLevel?: string;
}
export interface SendUserMessageReceipt {
  mailId: string;
  chatId: string;
  delivery: "started" | "inserted" | "queued";
  runId?: string;
  status?: string;
  error?: { code?: string; message?: string };
  ignoredOptions?: string[];
}

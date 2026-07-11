import type {
  AIUsageSnapshotEvent,
  AppState,
  TimelineAttachment,
} from "@/app/state/types";
import type {
  QueryAccessLevel,
  QueryModelOverride,
} from "@/shared/data";

export type BTWSessionStatus = "idle" | "running" | "error";

export interface BTWQueryConfig {
  accessLevel?: QueryAccessLevel;
  model?: QueryModelOverride;
  params?: Record<string, unknown>;
}

export interface BTWTranscriptItem {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
  attachments?: TimelineAttachment[];
}

export interface BTWSessionState {
  parentChatId: string;
  btwId: string;
  runId: string;
  requestId: string;
  agentKey: string;
  status: BTWSessionStatus;
  interruptReady: boolean;
  interruptPending: boolean;
  draft: string;
  error: string;
  focusToken: number;
  lastSeq: number;
  updatedAt: number;
  usage: AIUsageSnapshotEvent | null;
  config: BTWQueryConfig;
  projection: AppState;
}

export interface PersistedBTWSession {
  parentChatId: string;
  btwId: string;
  runId: string;
  requestId: string;
  agentKey: string;
  status: BTWSessionStatus;
  draft: string;
  lastSeq: number;
  updatedAt: number;
  config: BTWQueryConfig;
  transcript: BTWTranscriptItem[];
}

export interface OpenBTWOptions extends BTWQueryConfig {
  parentChatId?: string;
  message?: string;
  references?: unknown[];
  attachments?: TimelineAttachment[];
  sendImmediately?: boolean;
}

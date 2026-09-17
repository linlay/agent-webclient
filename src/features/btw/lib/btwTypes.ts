import type { AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";
import type { AppState } from "@/app/state/AppContext";
import type { TimelineAttachment, TimelineNode } from "@/features/timeline/lib/timelineState";
import type {
  QueryAccessLevel,
  QueryModelOverride,
} from "@/shared/data";
import type { RunOwner } from "@/shared/data/runOwner";
import type { SelectedTextFragment } from "@/features/selection/lib/selectedTextReference";

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
  owner?: RunOwner;
  status: BTWSessionStatus;
  interruptReady: boolean;
  interruptPending: boolean;
  draft: string;
  draftSelections: SelectedTextFragment[];
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
  owner?: RunOwner;
  status: BTWSessionStatus;
  draft: string;
  lastSeq: number;
  updatedAt: number;
  config: BTWQueryConfig;
  transcript: BTWTranscriptItem[];
  sourceNodes?: TimelineNode[];
}

export interface OpenBTWOptions extends BTWQueryConfig {
  parentChatId?: string;
  message?: string;
  references?: unknown[];
  attachments?: TimelineAttachment[];
  sendImmediately?: boolean;
}

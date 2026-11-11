/** Frozen display envelope shared by event projection and snapshot rendering. */
export interface AwaitingAnswerEnvelope {
  status?: "answered" | "error";
  items?: Record<string, unknown>[];
  planning?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

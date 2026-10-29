export interface ExecuteRequest {
  requestId?: string;
  agentKey: string;
  message: string;
  input?: unknown;
  outputSchema: Record<string, unknown>;
  accessLevel?: "default" | "ask_for_approval" | "auto_approve" | "full_access";
}

export type ExecuteResult = { chatId: string } & (
  | { status: "success"; output: Record<string, unknown> }
  | { status: "failure"; reason: string }
);

export interface ExecuteFile {
  field: string;
  file: File;
}

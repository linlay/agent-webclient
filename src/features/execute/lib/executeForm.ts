import type { ExecuteFile, ExecuteRequest } from "@/shared/data/api/dto/execute";

export const exampleSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    tasks: { type: "array", items: {
      type: "object",
      properties: { title: { type: "string" }, owner: { type: "string" }, due: { type: "string" } },
      required: ["title", "owner", "due"],
      additionalProperties: false,
    } },
  },
  required: ["summary", "tasks"],
  additionalProperties: false,
};

export type ExecuteValidationCode = "message" | "input" | "schema" | "files" | "references" | "attachmentConflict";
export class ExecuteValidationError extends Error {
  constructor(public field: ExecuteValidationCode) { super(field); }
}

export function parseExecuteReferences(value = ""): unknown[] {
  try {
    const references: unknown = value.trim() ? JSON.parse(value) : [];
    if (!Array.isArray(references)) throw new Error();
    return references;
  } catch { throw new ExecuteValidationError("references"); }
}

export function buildExecuteRequest(params: {
  agentKey: string; message: string; input: string; schema: string;
  accessLevel: ExecuteRequest["accessLevel"]; files: ExecuteFile[];
  chatId?: string; references?: string;
}): ExecuteRequest {
  if (!params.message.trim()) throw new ExecuteValidationError("message");
  let input: unknown;
  try { input = params.input.trim() ? JSON.parse(params.input) : undefined; }
  catch { throw new ExecuteValidationError("input"); }
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(params.schema);
    if (!schema || Array.isArray(schema) || schema.type !== "object" || new TextEncoder().encode(params.schema).length > 65536) throw new Error();
  } catch { throw new ExecuteValidationError("schema"); }
  const chatId = params.chatId?.trim();
  const references = parseExecuteReferences(params.references);
  if (params.files.length && (chatId || references.length)) throw new ExecuteValidationError("attachmentConflict");
  const refs = new Set<string>();
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if ("$file" in record) {
      if (Object.keys(record).length !== 1 || typeof record.$file !== "string") throw new ExecuteValidationError("files");
      refs.add(record.$file);
      return;
    }
    Object.values(record).forEach(visit);
  }
  visit(input);
  const fields = new Set(params.files.map(f => f.field));
  if (fields.size !== params.files.length || fields.has("request") || refs.size !== fields.size || [...refs].some(f => !fields.has(f))
    || new Set(params.files.map(f => f.file.name)).size !== params.files.length) throw new ExecuteValidationError("files");
  return {
    agentKey: params.agentKey, message: params.message,
    ...(chatId ? { chatId } : {}), ...(references.length ? { references } : {}),
    ...(input !== undefined ? { input } : {}), outputSchema: schema, accessLevel: params.accessLevel,
  };
}

interface QuestionOption {label: string; value?: string}
export interface MailQuestion {id: string; question: string; type?: string; options?: QuestionOption[]}
export interface MailApproval {id: string; toolName?: string; command?: string; description?: string; options?: {decision: string; label?: string}[]}
export interface MailField {name: string; type: string; label?: string; multiple?: boolean; required?: boolean; options?: string[]}
export interface MailAskSnapshot {questions: MailQuestion[]; approvals: MailApproval[]; fields: MailField[]}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const records = (value: unknown) => Array.isArray(value) ? value.filter(record) : [];
export function parseMailAskSnapshot(message: string): MailAskSnapshot | undefined {
  let value: unknown;
  try {value = JSON.parse(message);} catch {return undefined;}
  if (!record(value)) return undefined;
  const text = (v: unknown) => typeof v === "string" ? v : undefined;
  return {
    questions: records(value.questions).flatMap(q => typeof q.id === "string" && typeof q.question === "string" ? [{
      id: q.id, question: q.question, type: text(q.type),
      options: records(q.options).flatMap(o => typeof o.label === "string" ? [{label: o.label, value: text(o.value)}] : []),
    }] : []),
    approvals: records(value.approvals).flatMap(a => typeof a.id === "string" ? [{
      id: a.id, toolName: text(a.toolName), command: text(a.command), description: text(a.description),
      options: records(a.options).flatMap(o => typeof o.decision === "string" ? [{decision: o.decision, label: text(o.label)}] : []),
    }] : []),
    fields: records(value.fields).flatMap(f => typeof f.name === "string" && typeof f.type === "string" ? [{
      name: f.name, type: f.type, label: text(f.label), multiple: f.multiple === true, required: f.required === true,
      options: Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === "string") : [],
    }] : []),
  };
}

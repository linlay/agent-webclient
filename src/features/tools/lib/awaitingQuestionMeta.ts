import type {
  AIAwaitApproval,
  AIAwaitForm,
  AIAwaitQuestion,
  AIAwaitQuestionSubmitParamData,
  AIAwaitQuestionType,
} from '@/app/state/types';

export const MASKED_PASSWORD_VALUE = '••••••';

interface AwaitingQuestionMeta {
  kind: 'question';
  id: string;
  header?: string;
  question: string;
  type: AIAwaitQuestionType;
}

interface AwaitingApprovalMeta {
  kind: 'approval';
  id: string;
  command: string;
  ruleKey?: string;
  description?: string;
}

interface AwaitingFormMeta {
  kind: 'form';
  id: string;
  action?: string;
  title?: string;
}

export type AwaitingItemMeta =
  | AwaitingQuestionMeta
  | AwaitingApprovalMeta
  | AwaitingFormMeta;

interface AwaitingQuestionMetaStore {
  byId: Map<string, AwaitingItemMeta>;
  byQuestion: Map<string, AwaitingQuestionMeta>;
}

const awaitingQuestionMetaByKey = new Map<string, AwaitingQuestionMetaStore>();

export function buildAwaitingQuestionMetaKey(
  runId: string,
  awaitingId: string,
): string {
  return `${runId}#${awaitingId}`;
}

export function clearAllAwaitingQuestionMeta(): void {
  awaitingQuestionMetaByKey.clear();
}

export function clearAwaitingQuestionMeta(
  runId: string,
  awaitingId: string,
): void {
  awaitingQuestionMetaByKey.delete(buildAwaitingQuestionMetaKey(runId, awaitingId));
}

export function registerAwaitingQuestionMeta(
  runId: string,
  awaitingId: string,
  questions: AIAwaitQuestion[],
): void {
  const key = buildAwaitingQuestionMetaKey(runId, awaitingId);
  const byId = new Map<string, AwaitingQuestionMeta>();
  const byQuestion = new Map<string, AwaitingQuestionMeta>();

  for (const question of questions) {
    const id = question.id || question.question;
    if (!id || !question.question) {
      continue;
    }
    const meta: AwaitingQuestionMeta = {
      kind: 'question',
      id,
      header: question.header,
      question: question.question,
      type: question.type,
    };
    byId.set(id, meta);
    byQuestion.set(question.question, meta);
  }

  if (byId.size === 0) {
    awaitingQuestionMetaByKey.delete(key);
    return;
  }

  awaitingQuestionMetaByKey.set(key, {
    byId,
    byQuestion,
  });
}

function getAwaitingMetaStore(
  runId: string,
  awaitingId: string,
): AwaitingQuestionMetaStore | null {
  return awaitingQuestionMetaByKey.get(
    buildAwaitingQuestionMetaKey(runId, awaitingId),
  ) ?? null;
}

export function registerAwaitingApprovalMeta(
  runId: string,
  awaitingId: string,
  approvals: AIAwaitApproval[],
): void {
  const key = buildAwaitingQuestionMetaKey(runId, awaitingId);
  const existing = awaitingQuestionMetaByKey.get(key);
  const byId = existing?.byId ?? new Map<string, AwaitingItemMeta>();
  const byQuestion = existing?.byQuestion ?? new Map<string, AwaitingQuestionMeta>();

  for (const approval of approvals) {
    if (!approval.id || !approval.command) {
      continue;
    }
    byId.set(approval.id, {
      kind: 'approval',
      id: approval.id,
      command: approval.command,
      ruleKey: approval.ruleKey,
      description: approval.description,
    });
  }

  awaitingQuestionMetaByKey.set(key, { byId, byQuestion });
}

export function registerAwaitingFormMeta(
  runId: string,
  awaitingId: string,
  forms: AIAwaitForm[],
): void {
  const key = buildAwaitingQuestionMetaKey(runId, awaitingId);
  const existing = awaitingQuestionMetaByKey.get(key);
  const byId = existing?.byId ?? new Map<string, AwaitingItemMeta>();
  const byQuestion = existing?.byQuestion ?? new Map<string, AwaitingQuestionMeta>();

  for (const form of forms) {
    if (!form.id) {
      continue;
    }
    byId.set(form.id, {
      kind: 'form',
      id: form.id,
      action: form.action,
      title: form.title,
    });
  }

  awaitingQuestionMetaByKey.set(key, { byId, byQuestion });
}

export function getAwaitingItemMeta(
  runId: string,
  awaitingId: string,
  id: string,
): AwaitingItemMeta | null {
  const metaStore = getAwaitingMetaStore(runId, awaitingId);
  if (!metaStore) {
    return null;
  }
  return metaStore.byId.get(id) ?? null;
}

export function getAwaitingQuestionMeta(
  runId: string,
  awaitingId: string,
  id: string,
): AwaitingQuestionMeta | null {
  const meta = getAwaitingItemMeta(runId, awaitingId, id);
  return meta?.kind === 'question' ? meta : null;
}

export function getAwaitingQuestionMetaByQuestion(
  runId: string,
  awaitingId: string,
  question: string,
): AwaitingQuestionMeta | null {
  const metaStore = getAwaitingMetaStore(runId, awaitingId);
  if (!metaStore) {
    return null;
  }
  return metaStore.byQuestion.get(question) ?? null;
}

export function maskAwaitingAnswerParams(
  runId: string,
  awaitingId: string,
  params: AIAwaitQuestionSubmitParamData[],
): AIAwaitQuestionSubmitParamData[] {
  return params.map((item) => {
    const meta = getAwaitingQuestionMeta(runId, awaitingId, item.id);
    if (meta?.type !== 'password') {
      return { ...item };
    }
    return {
      ...item,
      answer: MASKED_PASSWORD_VALUE,
      answers: item.answers?.map(() => MASKED_PASSWORD_VALUE),
    };
  });
}

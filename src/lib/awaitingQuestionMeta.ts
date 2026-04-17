import type {
  AIAwaitQuestion,
  AIAwaitQuestionType,
  AIAwaitSubmitParamData,
} from '../context/types';

export const MASKED_PASSWORD_VALUE = '••••••';

interface AwaitingQuestionMeta {
  header?: string;
  question: string;
  type: AIAwaitQuestionType;
}

const awaitingQuestionMetaByKey = new Map<string, Map<string, AwaitingQuestionMeta>>();

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
  const metaByQuestion = new Map<string, AwaitingQuestionMeta>();

  for (const question of questions) {
    if (!question.question) {
      continue;
    }
    metaByQuestion.set(question.question, {
      header: question.header,
      question: question.question,
      type: question.type,
    });
  }

  if (metaByQuestion.size === 0) {
    awaitingQuestionMetaByKey.delete(key);
    return;
  }

  awaitingQuestionMetaByKey.set(key, metaByQuestion);
}

export function getAwaitingQuestionMeta(
  runId: string,
  awaitingId: string,
  question: string,
): AwaitingQuestionMeta | null {
  const metaByQuestion = awaitingQuestionMetaByKey.get(
    buildAwaitingQuestionMetaKey(runId, awaitingId),
  );
  if (!metaByQuestion) {
    return null;
  }
  return metaByQuestion.get(question) ?? null;
}

export function maskAwaitingAnswerParams(
  runId: string,
  awaitingId: string,
  params: AIAwaitSubmitParamData[],
): AIAwaitSubmitParamData[] {
  return params.map((item) => {
    const meta = getAwaitingQuestionMeta(runId, awaitingId, item.question);
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

import { toText } from "@/shared/utils/eventUtils";

export interface AwaitingAnswerErrorInfo {
  code: string;
  message: string;
}

export function readAwaitingAnswerErrorInfo(
  event: Record<string, unknown>,
): AwaitingAnswerErrorInfo {
  const rawError = event.error;
  const error =
    rawError && typeof rawError === "object" && !Array.isArray(rawError)
      ? (rawError as Record<string, unknown>)
      : null;

  return {
    code: toText(error?.code) || toText(event.errorCode),
    message:
      toText(error?.message) ||
      toText(event.errorMessage) ||
      toText(event.message),
  };
}

export function isAwaitingAnswerTimeoutError(
  event: Record<string, unknown>,
): boolean {
  return (
    toText(event.status) === "error" &&
    readAwaitingAnswerErrorInfo(event).code === "timeout"
  );
}

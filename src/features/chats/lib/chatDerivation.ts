import { deriveChat } from "@/shared/data";

export function isDeriveChatActionDisabled(input: {
  chatId?: unknown;
  runId?: unknown;
}): boolean {
  return (
    !String(input.chatId || "").trim() ||
    !String(input.runId || "").trim()
  );
}

export async function deriveChatFromRun(
  sourceChatId: string,
  sourceRunId: string,
): Promise<{ chatId: string; unavailableResources: string[] }> {
  const response = await deriveChat({
    sourceChatId: String(sourceChatId || "").trim(),
    sourceRunId: String(sourceRunId || "").trim(),
  });
  const derivedChatId = String(response.data?.chatId || "").trim();
  if (!derivedChatId) {
    throw new Error("derive response missing chatId");
  }
  return { chatId: derivedChatId, unavailableResources: response.data?.unavailableResources ?? [] };
}

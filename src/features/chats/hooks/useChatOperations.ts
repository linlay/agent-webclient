import { useState, type Dispatch } from "react";
import type { AppAction } from "@/app/state/actions";
import {
  archiveChats,
  deleteChat,
  downloadChatExport,
  downloadConversationHtmlExport,
  renameChat,
} from "@/shared/data";

// Confirmation dialogs and notifications belong to each entry point.
export function useChatOperations(
  activeChatId: string,
  dispatch: Dispatch<AppAction>,
  t: (key: string) => string,
) {
  const [pending, setPending] = useState(false);

  const run = async (label: string, operation: () => Promise<void>) => {
    setPending(true);
    try {
      await operation();
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[${label} error] ${(error as Error).message}`,
      });
      throw error;
    } finally {
      setPending(false);
    }
  };

  const clearActiveChatIfNeeded = (chatId: string) => {
    if (String(activeChatId || "") !== chatId) return;
    dispatch({ type: "SET_CHAT_ID", chatId: "" });
    dispatch({ type: "SET_RUN_ID", runId: "" });
    dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
    window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
    window.dispatchEvent(new CustomEvent("agent:voice-reset"));
  };

  const archive = (chatId: string, onArchived?: (chatId: string) => void) =>
    run("archive chat", async () => {
      const response = await archiveChats({ chatIds: [chatId] });
      const result = response.data?.results?.[0];
      if (!result?.success) {
        throw new Error(result?.error || t("chatActions.archive.failed"));
      }
      dispatch({ type: "CHAT_ARCHIVED", chatId });
      onArchived?.(chatId);
      clearActiveChatIfNeeded(chatId);
    });

  const remove = (chatId: string, onDeleted?: (chatId: string) => void) =>
    run("delete chat", async () => {
      await deleteChat({ chatId });
      dispatch({ type: "CHAT_DELETED", chatId });
      onDeleted?.(chatId);
      clearActiveChatIfNeeded(chatId);
    });

  const rename = (chatId: string, chatName: string) =>
    run("rename chat", async () => {
      const response = await renameChat({ chatId, chatName });
      dispatch({
        type: "CHAT_RENAMED",
        chatId,
        chatName: String(response.data?.chatName || "").trim() || chatName,
      });
    });

  const exportChat = (chatId: string, format: "markdown" | "html") =>
    run(`export chat ${format}`, async () => {
      if (format === "html") {
        await downloadConversationHtmlExport(chatId);
      } else {
        await downloadChatExport(chatId);
      }
    });

  return { pending, archive, remove, rename, exportChat };
}

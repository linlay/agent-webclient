import { useCallback } from "react";
import { useAppContext } from "@/app/state/AppContext";
import type { WorkerRow } from "@/app/state/types";
import {
	isChatActiveRun,
	isWorkerAttentionChat,
} from "@/features/chats/lib/chatRunState";
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";
import { useI18n } from "@/shared/i18n";

export interface WorkerConversationSelectionOptions {
	loadChat: (
		chatId: string,
		options?: { focusComposerOnComplete?: boolean },
	) => Promise<void>;
	activateBlankConversation: (options?: {
		preserveWorkerContext?: boolean;
		focusComposerOnComplete?: boolean;
	}) => void;
}

export function useWorkerConversationSelection(
	input: WorkerConversationSelectionOptions,
): {
	selectWorkerConversation: (
		workerKey: string,
		options?: {
			focusComposerOnComplete?: boolean;
			preferNewChat?: boolean;
		},
	) => Promise<void>;
} {
	const { dispatch, stateRef } = useAppContext();
	const { t } = useI18n();
	const { activateBlankConversation, loadChat } = input;

	const selectWorkerConversation = useCallback(
		async (
			workerKey: string,
			options: {
				focusComposerOnComplete?: boolean;
				preferNewChat?: boolean;
			} = {},
		) => {
			const normalized = String(workerKey || "").trim();
			if (!normalized) return;
			const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);
			const preferNewChat = Boolean(options.preferNewChat);
			const row = stateRef.current.workerIndexByKey.get(normalized) as
				| WorkerRow
				| undefined;
			if (!row) return;
			const pendingAgentKey =
				row.type === "agent" ? String(row.sourceId || "").trim() : "";

			dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey: normalized });
			const workerChats = buildWorkerConversationRows({
				chats: stateRef.current.chats,
				worker: row,
			});
			dispatch({ type: "SET_WORKER_RELATED_CHATS", chats: workerChats });
			dispatch({ type: "SET_WORKER_CHAT_PANEL_COLLAPSED", collapsed: true });

			const appendNoHistoryDebug = () => {
				dispatch({
					type: "APPEND_DEBUG",
					line: t("worker.history.none", {
						kind: row.type === "team" ? t("worker.kindLabel.team") : t("worker.kindLabel.agent"),
						name: row.displayName,
					}),
				});
			};

			if (preferNewChat) {
				const runningChat = workerChats.find(isChatActiveRun);
				const latestChat = workerChats[0];
				const targetChat =
					runningChat ||
					(isWorkerAttentionChat(latestChat) ? latestChat : undefined);
				const targetChatId = String(targetChat?.chatId || "").trim();
				if (targetChatId) {
					await loadChat(targetChatId, { focusComposerOnComplete });
					return;
				}

				activateBlankConversation({
					preserveWorkerContext: true,
					focusComposerOnComplete,
				});
				dispatch({
					type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
					agentKey: pendingAgentKey,
				});
				dispatch({
					type: "SET_WORKER_PRIORITY_KEY",
					workerKey: pendingAgentKey ? normalized : "",
				});
				if (!row.hasHistory || !row.latestChatId) {
					appendNoHistoryDebug();
				}
				return;
			}

			if (row.hasHistory && row.latestChatId) {
				await loadChat(row.latestChatId, { focusComposerOnComplete });
				return;
			}

			activateBlankConversation({
				preserveWorkerContext: true,
				focusComposerOnComplete,
			});
			dispatch({
				type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
				agentKey: pendingAgentKey,
			});
			dispatch({
				type: "SET_WORKER_PRIORITY_KEY",
				workerKey: pendingAgentKey ? normalized : "",
			});
			appendNoHistoryDebug();
		},
		[activateBlankConversation, dispatch, loadChat, stateRef, t],
	);

	return { selectWorkerConversation };
}

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "@/app/state/AppContext";
import type { Chat } from "@/app/state/types";
import { markChatRead } from "@/shared/data";
import {
	normalizeChatReadState,
	upsertAgentUnreadCount,
} from "@/features/chats/lib/chatReadState";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object";
}

export function shouldAutoMarkChatRead(
	chat: Pick<Chat, "chatId" | "read"> | null | undefined,
): boolean {
	return Boolean(String(chat?.chatId || "").trim()) && chat?.read?.isRead === false;
}

export function getAutoReadTriggerKey(
	chat:
		| Pick<Chat, "chatId" | "lastRunId" | "updatedAt" | "read">
		| null
		| undefined,
): string {
	if (!shouldAutoMarkChatRead(chat)) {
		return "";
	}

	return [
		String(chat?.chatId || "").trim(),
		String(chat?.lastRunId || "").trim(),
		String(chat?.updatedAt ?? "").trim(),
		String(chat?.read?.readAt ?? "").trim(),
		String(chat?.read?.readRunId || "").trim(),
	].join("|");
}

export function useChatReadSync(): void {
	const { state, dispatch, stateRef } = useAppContext();
	const lastAutoReadTriggerKeyRef = useRef("");

	const syncMarkReadResult = useCallback(
		(chatId: string, data: unknown) => {
			if (!isObjectRecord(data)) {
				return;
			}

			const read = normalizeChatReadState(data.read);
			if (read) {
				dispatch({ type: "UPSERT_CHAT", chat: { chatId, read } });
			}

			const agentKey = String(data.agentKey || "").trim();
			const agentUnreadCount = Number(data.agentUnreadCount);
			if (!agentKey || !Number.isFinite(agentUnreadCount) || agentUnreadCount < 0) {
				return;
			}
			const nextAgents = upsertAgentUnreadCount(
				stateRef.current.agents,
				agentKey,
				agentUnreadCount,
			);
			if (nextAgents !== stateRef.current.agents) {
				dispatch({ type: "SET_AGENTS", agents: nextAgents });
			}
		},
		[dispatch, stateRef],
	);

	const autoMarkReadIfNeeded = useCallback(
		async (chat: Chat | undefined) => {
			if (!shouldAutoMarkChatRead(chat)) {
				return;
			}
			try {
				const response = await markChatRead({
					chatId: String(chat?.chatId || "").trim(),
					runId: String(chat?.lastRunId || "").trim() || undefined,
				});
				syncMarkReadResult(String(chat?.chatId || "").trim(), response.data);
			} catch (error) {
				dispatch({
					type: "APPEND_DEBUG",
					line: `[markRead error] ${(error as Error).message}`,
				});
			}
		},
		[dispatch, syncMarkReadResult],
	);

	const activeChat = useMemo(
		() =>
			state.chats.find(
				(chat) => String(chat?.chatId || "") === String(state.chatId || ""),
			),
		[state.chatId, state.chats],
	);
	const autoReadTriggerKey = useMemo(
		() => getAutoReadTriggerKey(activeChat),
		[activeChat],
	);

	useEffect(() => {
		if (
			!autoReadTriggerKey ||
			!activeChat ||
			lastAutoReadTriggerKeyRef.current === autoReadTriggerKey
		) {
			return;
		}
		lastAutoReadTriggerKeyRef.current = autoReadTriggerKey;
		void autoMarkReadIfNeeded(activeChat);
	}, [activeChat, autoMarkReadIfNeeded, autoReadTriggerKey]);
}

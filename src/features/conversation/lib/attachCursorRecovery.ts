import { chatSurfaceReplayErrorCode } from "@/features/conversation/lib/chatSurfaceReplay";

/**
 * Retry delays after a Main Chat attach cursor expires. While one huge step
 * is still unpersisted, `/api/chat` keeps an old cursor that Platform no
 * longer retains, so an immediate reload would expire again.
 */
export const ATTACH_CURSOR_RECOVERY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;

export function isAttachCursorExpired(cause: unknown): boolean {
	const code = chatSurfaceReplayErrorCode(cause);
	return code === "seq_expired" || code === "replay_required";
}

export interface AttachCursorRecovery {
	/** Schedules a Chat reload; repeated expiry of the same Run backs off. */
	expired(chatId: string, runId: string): void;
	/** Runs a scheduled reload now, e.g. when the Run asks for confirmation. */
	nudge(chatId: string): void;
	cancel(): void;
}

export function createAttachCursorRecovery(input: {
	reload(chatId: string): void;
	isCurrentChat(chatId: string): boolean;
	setTimer?: (callback: () => void, delayMs: number) => unknown;
	clearTimer?: (timer: unknown) => void;
}): AttachCursorRecovery {
	const setTimer = input.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
	const clearTimer = input.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
	let pending: { chatId: string; runId: string; attempt: number; timer: unknown } | null = null;

	const stopTimer = () => {
		if (pending?.timer !== null && pending?.timer !== undefined) clearTimer(pending.timer);
		if (pending) pending.timer = null;
	};
	const fire = () => {
		if (!pending) return;
		pending.timer = null;
		if (!input.isCurrentChat(pending.chatId)) {
			pending = null;
			return;
		}
		input.reload(pending.chatId);
	};

	return {
		expired(chatId, runId) {
			const attempt = pending?.chatId === chatId && pending.runId === runId ? pending.attempt + 1 : 0;
			stopTimer();
			const delay = ATTACH_CURSOR_RECOVERY_DELAYS_MS[Math.min(attempt, ATTACH_CURSOR_RECOVERY_DELAYS_MS.length - 1)];
			pending = { chatId, runId, attempt, timer: null };
			pending.timer = setTimer(fire, delay);
		},
		nudge(chatId) {
			if (pending?.chatId !== chatId || pending.timer === null) return;
			stopTimer();
			fire();
		},
		cancel() {
			stopTimer();
			pending = null;
		},
	};
}

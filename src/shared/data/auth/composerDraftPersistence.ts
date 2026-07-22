const STORAGE_KEY = "agent-webclient.gateway-composer-draft";

export interface PersistedComposerDrafts {
	chatId: string;
	composerDraft: string;
	composerDraftByChatId: Record<string, string>;
}

export function persistComposerDrafts(snapshot: PersistedComposerDrafts): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
	} catch {
		// Session storage can be unavailable in restricted browser contexts.
	}
}

export function restoreComposerDrafts(): PersistedComposerDrafts | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<PersistedComposerDrafts>;
		const drafts: Record<string, string> = {};
		if (
			value.composerDraftByChatId &&
			typeof value.composerDraftByChatId === "object" &&
			!Array.isArray(value.composerDraftByChatId)
		) {
			for (const [key, draft] of Object.entries(value.composerDraftByChatId)) {
				if (typeof draft === "string") drafts[key] = draft;
			}
		}
		return {
			chatId: typeof value.chatId === "string" ? value.chatId : "",
			composerDraft:
				typeof value.composerDraft === "string" ? value.composerDraft : "",
			composerDraftByChatId: drafts,
		};
	} catch {
		return null;
	}
}

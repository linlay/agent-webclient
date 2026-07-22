import {
	persistComposerDrafts,
	restoreComposerDrafts,
} from "@/shared/data/auth/composerDraftPersistence";

describe("gateway composer draft persistence", () => {
	const originalWindow = global.window;

	afterEach(() => {
		Object.defineProperty(global, "window", {
			configurable: true,
			value: originalWindow,
		});
	});

	it("restores the current and chat-scoped drafts after an auth round trip", () => {
		const values = new Map<string, string>();
		Object.defineProperty(global, "window", {
			configurable: true,
			value: {
				sessionStorage: {
					getItem: (key: string) => values.get(key) || null,
					setItem: (key: string, value: string) => values.set(key, value),
				},
			},
		});

		persistComposerDrafts({
			chatId: "chat-1",
			composerDraft: "继续这个问题",
			composerDraftByChatId: { "chat-1": "继续这个问题" },
		});

		expect(restoreComposerDrafts()).toEqual({
			chatId: "chat-1",
			composerDraft: "继续这个问题",
			composerDraftByChatId: { "chat-1": "继续这个问题" },
		});
	});
});

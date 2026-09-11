import { appReducer } from "@/app/state/AppContext";
import { createInitialState } from "@/app/state/state";
import type { AppState } from "@/app/state/types";

jest.mock("@/shared/data", () => ({
	setAccessToken: jest.fn(),
}));

beforeEach(() => {
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: () => "",
		},
	});
});

function buildState(overrides: Partial<AppState> = {}): AppState {
	return {
		...createInitialState(),
		chatId: "",
		planningMode: false,
		planningModeByChatId: {},
		composerDraft: "",
		composerDraftByChatId: {},
		...overrides,
	};
}

describe("reduceConversationState – SET_CHAT_ID", () => {
	it("resets KBASE editing mode only when the chat changes", () => {
		const state = buildState({
			chatId: "chat_a",
			editingMode: true,
		});

		expect(
			appReducer(state, { type: "SET_CHAT_ID", chatId: "chat_a" })
				.editingMode,
		).toBe(true);
		expect(
			appReducer(state, { type: "SET_CHAT_ID", chatId: "chat_b" })
				.editingMode,
		).toBe(false);
	});

	it("resets KBASE editing mode when the selected worker changes", () => {
		const state = buildState({
			editingMode: true,
			workerSelectionKey: "agent:a",
		});

		expect(
			appReducer(state, {
				type: "SET_WORKER_SELECTION_KEY",
				workerKey: "agent:a",
			}).editingMode,
		).toBe(true);
		expect(
			appReducer(state, {
				type: "SET_WORKER_SELECTION_KEY",
				workerKey: "agent:b",
			}).editingMode,
		).toBe(false);
	});

	it("carries forward planningMode when switching to an unrecorded chatId", () => {
		const state = buildState({
			chatId: "",
			planningMode: true,
			planningModeByChatId: { "": true },
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_abc",
		});
		expect(next.planningMode).toBe(true);
		expect(next.planningModeByChatId).toEqual({
			"": true,
			chat_abc: true,
		});
	});

	it("respects an existing planningModeByChatId entry (false) over propagation", () => {
		const state = buildState({
			chatId: "chat_old",
			planningMode: true,
			planningModeByChatId: { chat_old: true, chat_new: false },
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_new",
		});
		expect(next.planningMode).toBe(false);
		expect(next.planningModeByChatId).toEqual({
			chat_old: true,
			chat_new: false,
		});
	});

	it("respects an existing planningModeByChatId entry (true) over propagation", () => {
		const state = buildState({
			chatId: "chat_old",
			planningMode: false,
			planningModeByChatId: { chat_old: false, chat_new: true },
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_new",
		});
		expect(next.planningMode).toBe(true);
		expect(next.planningModeByChatId).toEqual({
			chat_old: false,
			chat_new: true,
		});
	});

	it("does not propagate when chatId is unchanged", () => {
		const state = buildState({
			chatId: "chat_same",
			planningMode: true,
			planningModeByChatId: { chat_same: true },
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_same",
		});
		expect(next.planningMode).toBe(true);
		expect(next.planningModeByChatId).toEqual({ chat_same: true });
	});

	it("does not propagate when planningMode is false", () => {
		const state = buildState({
			chatId: "chat_a",
			planningMode: false,
			planningModeByChatId: { "": true, chat_a: false },
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_b",
		});
		expect(next.planningMode).toBe(false);
		expect(next.planningModeByChatId).toEqual({ "": true, chat_a: false });
	});

	it("sets planningMode to false when no record exists and current planningMode is off", () => {
		const state = buildState({
			chatId: "chat_a",
			planningMode: false,
			planningModeByChatId: {},
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_b",
		});
		expect(next.planningMode).toBe(false);
		expect(next.planningModeByChatId).toEqual({});
	});

	it("sets planningMode to true when chat has activeRun with planningMode=true", () => {
		const state = buildState({
			chatId: "",
			planningMode: false,
			planningModeByChatId: {},
			chats: [
				{
					chatId: "chat_active_plan",
					activeRun: { runId: "run_1", planningMode: true },
				} as any,
			],
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_active_plan",
		});
		expect(next.planningMode).toBe(true);
	});

	it("does not override explicit planningModeByChatId false when activeRun planningMode is true", () => {
		const state = buildState({
			chatId: "chat_old",
			planningMode: false,
			planningModeByChatId: { chat_target: false },
			chats: [
				{
					chatId: "chat_target",
					activeRun: { runId: "run_1", planningMode: true },
				} as any,
			],
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_target",
		});
		expect(next.planningMode).toBe(false);
		expect(next.planningModeByChatId).toEqual({ chat_target: false });
	});
});

describe("reduceConversationState – composerDraftByChatId", () => {
	it("switching chat saves current composerDraft and restores saved draft", () => {
		const state = buildState({
			chatId: "chat_a",
			composerDraft: "draft_a",
			composerDraftByChatId: { chat_b: "draft_b" },
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_b",
		});
		expect(next.composerDraft).toBe("draft_b");
		expect(next.composerDraftByChatId.chat_a).toBe("draft_a");
	});

	it("blank conversation draft is preserved when switching away and back", () => {
		const state = buildState({
			chatId: "",
			composerDraft: "blank_draft",
			composerDraftByChatId: {},
		});
		// Switch to a real chat
		const toChat = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_x",
		});
		expect(toChat.composerDraft).toBe("");
		expect(toChat.composerDraftByChatId[""]).toBe("blank_draft");
		expect(toChat.composerDraftByChatId.chat_x).toBeUndefined();

		// Switch back to blank conversation
		const toBlank = appReducer(toChat, {
			type: "SET_CHAT_ID",
			chatId: "",
		});
		expect(toBlank.composerDraft).toBe("blank_draft");
		expect(toBlank.composerDraftByChatId.chat_x).toBe("");
	});

	it("new chat with no saved draft gets empty string", () => {
		const state = buildState({
			chatId: "chat_a",
			composerDraft: "draft_a",
			composerDraftByChatId: {},
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_new",
		});
		expect(next.composerDraft).toBe("");
	});

	it("SET_COMPOSER_DRAFT also writes to composerDraftByChatId", () => {
		const state = buildState({
			chatId: "chat_x",
			composerDraft: "",
			composerDraftByChatId: {},
		});
		const next = appReducer(state, {
			type: "SET_COMPOSER_DRAFT",
			draft: "hello",
		});
		expect(next.composerDraft).toBe("hello");
		expect(next.composerDraftByChatId.chat_x).toBe("hello");
	});

	it("SET_COMPOSER_DRAFT writes to map even with empty chatId", () => {
		const state = buildState({
			chatId: "",
			composerDraft: "",
			composerDraftByChatId: {},
		});
		const next = appReducer(state, {
			type: "SET_COMPOSER_DRAFT",
			draft: "blank_draft",
		});
		expect(next.composerDraft).toBe("blank_draft");
		expect(next.composerDraftByChatId[""]).toBe("blank_draft");
	});
});

describe("reduceConversationState – selectedSkillsByChatId", () => {
	it("switching chat saves current selectedSkills and restores saved skills", () => {
		const skillsA = [{ key: "a", label: "A" }];
		const skillsB = [{ key: "b", label: "B" }];
		const state = buildState({
			chatId: "chat_a",
			selectedSkills: skillsA,
			selectedSkillsByChatId: { chat_b: skillsB },
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_b",
		});
		expect(next.selectedSkills).toBe(skillsB);
		expect(next.selectedSkillsByChatId.chat_a).toBe(skillsA);
	});

	it("new chat with no saved skills gets empty array", () => {
		const state = buildState({
			chatId: "chat_a",
			selectedSkills: [{ key: "a", label: "A" }],
			selectedSkillsByChatId: {},
		});
		const next = appReducer(state, {
			type: "SET_CHAT_ID",
			chatId: "chat_new",
		});
		expect(next.selectedSkills).toEqual([]);
	});

	it("SET_SELECTED_SKILLS also writes to selectedSkillsByChatId", () => {
		const skills = [{ key: "a", label: "A" }];
		const state = buildState({
			chatId: "chat_x",
			selectedSkills: [],
			selectedSkillsByChatId: {},
		});
		const next = appReducer(state, {
			type: "SET_SELECTED_SKILLS",
			skills,
		});
		expect(next.selectedSkills).toBe(skills);
		expect(next.selectedSkillsByChatId.chat_x).toBe(skills);
	});
});

describe("Composer drafts across conversation changes", () => {
	it("shares the blank-chat text and Skills across Agents while preserving history drafts", () => {
		const sharedSkills = [{ key: "shared", label: "Shared" }];
		const historySkills = [{ key: "history", label: "History" }];
		let state = buildState({ workerSelectionKey: "agent:a" });
		state = appReducer(state, { type: "SET_COMPOSER_DRAFT", draft: "shared draft" });
		state = appReducer(state, { type: "SET_SELECTED_SKILLS", skills: sharedSkills });
		state = appReducer(state, { type: "SET_CHAT_ID", chatId: "chat_a" });
		expect(state.composerDraft).toBe("");
		expect(state.selectedSkills).toEqual([]);
		state = appReducer(state, { type: "SET_COMPOSER_DRAFT", draft: "history draft" });
		state = appReducer(state, { type: "SET_SELECTED_SKILLS", skills: historySkills });
		state = appReducer(state, { type: "SET_WORKER_SELECTION_KEY", workerKey: "agent:b" });
		state = appReducer(state, { type: "SET_CHAT_ID", chatId: "" });
		state = appReducer(state, { type: "RESET_ACTIVE_CONVERSATION" });
		expect(state.workerSelectionKey).toBe("agent:b");
		expect(state.composerDraft).toBe("shared draft");
		expect(state.selectedSkills).toEqual(sharedSkills);
		expect(state.composerDraftByChatId).toEqual({ "": "shared draft", chat_a: "history draft" });
		expect(state.selectedSkillsByChatId).toEqual({ "": sharedSkills, chat_a: historySkills });

		state = appReducer(state, { type: "SET_WORKER_SELECTION_KEY", workerKey: "agent:c" });
		state = appReducer(state, { type: "SET_CHAT_ID", chatId: "" });
		state = appReducer(state, { type: "RESET_ACTIVE_CONVERSATION" });
		expect(state.composerDraft).toBe("shared draft");
		expect(state.selectedSkills).toEqual(sharedSkills);

		state = appReducer(state, { type: "SET_CHAT_ID", chatId: "chat_a" });
		expect(state.composerDraft).toBe("history draft");
		expect(state.selectedSkills).toEqual(historySkills);
	});

	it.each(["chat_a", ""])("does not resurrect cleared text or removed Skills for chat %p", (chatId) => {
		const otherSkills = [{ key: "other", label: "Other" }];
		const original = buildState({
			chatId,
			composerDraft: "old draft",
			composerDraftByChatId: { [chatId]: "old draft", chat_b: "other draft" },
			selectedSkills: [{ key: "old", label: "Old" }],
			selectedSkillsByChatId: { [chatId]: [{ key: "old", label: "Old" }], chat_b: otherSkills },
		});
		let state = appReducer(original, { type: "SET_COMPOSER_DRAFT", draft: "" });
		state = appReducer(state, { type: "SET_SELECTED_SKILLS", skills: [] });
		state = appReducer(state, { type: "SET_CHAT_ID", chatId: "chat_b" });
		expect(state.composerDraft).toBe("other draft");
		expect(state.selectedSkills).toEqual(otherSkills);
		state = appReducer(state, { type: "SET_CHAT_ID", chatId });
		expect(state.composerDraft).toBe("");
		expect(state.selectedSkills).toEqual([]);
		expect(state.composerDraftByChatId).toEqual({ [chatId]: "", chat_b: "other draft" });
		expect(state.selectedSkillsByChatId).toEqual({ [chatId]: [], chat_b: otherSkills });
		expect(original.composerDraftByChatId[chatId]).toBe("old draft");
		expect(original.selectedSkillsByChatId[chatId]).toEqual([{ key: "old", label: "Old" }]);
	});

	it.each(["chat_a", ""])("preserves draft records when selecting the same chat %p", (chatId) => {
		const skills = [{ key: "review", label: "Review" }];
		const state = buildState({
			chatId,
			composerDraft: "draft",
			composerDraftByChatId: { [chatId]: "draft" },
			selectedSkills: skills,
			selectedSkillsByChatId: { [chatId]: skills },
		});
		const next = appReducer(state, { type: "SET_CHAT_ID", chatId });
		expect(next.composerDraft).toBe("draft");
		expect(next.selectedSkills).toBe(skills);
		expect(next.composerDraftByChatId).toBe(state.composerDraftByChatId);
		expect(next.selectedSkillsByChatId).toBe(state.selectedSkillsByChatId);
	});
});

describe("reduceConversationState – chat transition", () => {
	it("advances only the matching transition and rejects stale work", () => {
		const started = appReducer(buildState(), {
			type: "BEGIN_CHAT_TRANSITION",
			transition: {
				seq: 1,
				sourceChatId: "chat-a",
				targetChatId: "chat-b",
				phase: "loading",
				kind: "history-switch",
				displayMode: "blocking",
				focusComposerOnReady: true,
				error: "",
			},
		});
		expect(started.chatLoadSeq).toBe(1);
		expect(started.chatTransition?.phase).toBe("loading");

		const background = appReducer(started, {
			type: "SET_CHAT_TRANSITION_DISPLAY_MODE",
			seq: 1,
			targetChatId: "chat-b",
			displayMode: "background",
		});
		expect(background.chatTransition?.displayMode).toBe("background");

		const stickyBackground = appReducer(background, {
			type: "SET_CHAT_TRANSITION_DISPLAY_MODE",
			seq: 1,
			targetChatId: "chat-b",
			displayMode: "blocking",
		});
		expect(stickyBackground).toBe(background);

		const staleDisplayMode = appReducer(background, {
			type: "SET_CHAT_TRANSITION_DISPLAY_MODE",
			seq: 1,
			targetChatId: "chat-c",
			displayMode: "blocking",
		});
		expect(staleDisplayMode).toBe(background);

		const stale = appReducer(background, {
			type: "ADVANCE_CHAT_TRANSITION",
			seq: 1,
			targetChatId: "chat-c",
			phase: "applying",
		});
		expect(stale).toBe(background);

		const applying = appReducer(background, {
			type: "ADVANCE_CHAT_TRANSITION",
			seq: 1,
			targetChatId: "chat-b",
			phase: "applying",
		});
		expect(applying.chatTransition?.phase).toBe("applying");
		expect(applying.chatTransition?.displayMode).toBe("background");
	});

	it("records errors and creates monotonic explicit scroll requests", () => {
		const started = appReducer(buildState(), {
			type: "BEGIN_CHAT_TRANSITION",
			transition: {
				seq: 2,
				sourceChatId: "",
				targetChatId: "chat-b",
				phase: "loading",
				kind: "initial-load",
				displayMode: "blocking",
				focusComposerOnReady: false,
				error: "",
			},
		});
		const failed = appReducer(started, {
			type: "FAIL_CHAT_TRANSITION",
			seq: 2,
			targetChatId: "chat-b",
			error: "network down",
		});
		expect(failed.chatTransition).toMatchObject({
			phase: "error",
			error: "network down",
		});

		const first = appReducer(failed, {
			type: "REQUEST_CONVERSATION_SCROLL",
			chatId: "chat-b",
			reason: "local-send",
		});
		const second = appReducer(first, {
			type: "REQUEST_CONVERSATION_SCROLL",
			chatId: "chat-b",
			reason: "user-click",
		});
		expect(first.conversationScrollRequest?.id).toBe(1);
		expect(second.conversationScrollRequest).toMatchObject({
			id: 2,
			chatId: "chat-b",
			reason: "user-click",
		});
	});
});

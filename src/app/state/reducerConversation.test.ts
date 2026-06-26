import { appReducer } from "@/app/state/AppContext";
import { createInitialState } from "@/app/state/state";
import type { AppState } from "@/app/state/types";

jest.mock("@/shared/data", () => ({
	setTransportModeProvider: jest.fn(),
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

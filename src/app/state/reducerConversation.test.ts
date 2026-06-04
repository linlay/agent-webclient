import { appReducer } from "@/app/state/AppContext";
import { createInitialState } from "@/app/state/state";
import type { AppState } from "@/app/state/types";

jest.mock("@/features/transport/lib/apiClientProxy", () => ({
	setTransportModeProvider: jest.fn(),
}));

jest.mock("@/shared/api/apiClient", () => ({
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
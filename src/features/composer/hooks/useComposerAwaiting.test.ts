import type { AppAction } from "@/app/state/AppContext";
import { createInitialState } from "@/app/state/state";
import type { ActiveAwaiting } from "@/app/state/types";
import { ApiError } from "@/shared/data";
import {
	buildPlanDecisionPlanningModeAction,
	resolveAwaitingSubmitAgentKey,
	submitComposerAwaiting,
} from "@/features/composer/hooks/useComposerAwaiting";

describe("resolveAwaitingSubmitAgentKey", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: () => "",
			},
		});
	});

	it("uses run identity when active awaiting omitted agentKey", () => {
		const state = {
			...createInitialState(),
			chatId: "chat_1",
			runId: "run_1",
			currentRunAgentKey: "agent_run",
			runAgentById: new Map([["run_1", "agent_run"]]),
			chatAgentById: new Map([["chat_1", "agent_chat"]]),
		};
		const activeAwaiting: ActiveAwaiting = {
			key: "run_1#await_1",
			runId: "run_1",
			awaitingId: "await_1",
			agentKey: "",
			timeout: null,
			mode: "question",
			questions: [],
		};

		expect(
			resolveAwaitingSubmitAgentKey({
				activeAwaiting,
				state,
				runId: "run_1",
			}),
		).toBe("agent_run");
	});

	it("builds planning mode actions for accepted plan decisions", () => {
		const activeAwaiting: ActiveAwaiting = {
			key: "run_1#await_1",
			runId: "run_1",
			awaitingId: "await_1",
			agentKey: "agent_run",
			timeout: null,
			mode: "plan",
			plan: {
				id: "confirm",
			},
		};

		expect(
			buildPlanDecisionPlanningModeAction({
				activeAwaiting,
				chatId: "chat_1",
				params: [{ id: "confirm", decision: "approve" }],
			}),
		).toEqual({
			type: "SET_PLANNING_MODE",
			chatId: "chat_1",
			enabled: false,
			persist: true,
		});

		expect(
			buildPlanDecisionPlanningModeAction({
				activeAwaiting,
				chatId: "chat_1",
				params: [{ id: "confirm", decision: "reject" }],
			}),
		).toEqual({
			type: "SET_PLANNING_MODE",
			chatId: "chat_1",
			enabled: true,
			persist: true,
		});
	});

	it("does not build planning mode actions for non-plan or missing decisions", () => {
		const questionAwaiting: ActiveAwaiting = {
			key: "run_1#await_1",
			runId: "run_1",
			awaitingId: "await_1",
			agentKey: "agent_run",
			timeout: null,
			mode: "question",
			questions: [],
		};

		expect(
			buildPlanDecisionPlanningModeAction({
				activeAwaiting: questionAwaiting,
				chatId: "chat_1",
				params: [{ id: "confirm", decision: "reject" }],
			}),
		).toBeNull();

		expect(
			buildPlanDecisionPlanningModeAction({
				activeAwaiting: null,
				chatId: "chat_1",
				params: [{ id: "confirm", decision: "approve" }],
			}),
		).toBeNull();

		expect(
			buildPlanDecisionPlanningModeAction({
				activeAwaiting: {
					key: "run_1#await_1",
					runId: "run_1",
					awaitingId: "await_1",
					agentKey: "agent_run",
					timeout: null,
					mode: "plan",
					plan: { id: "confirm" },
				},
				chatId: "chat_1",
				params: [],
			}),
		).toBeNull();
	});
});

describe("submitComposerAwaiting", () => {
	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
		delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
	});

	it("does not attach when submit response continues the run", async () => {
		const dispatch = jest.fn<void, [AppAction]>();
		const clearActiveAwaiting = jest.fn();
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: unknown;

			constructor(type: string, init?: { detail?: unknown }) {
				this.type = type;
				this.detail = init?.detail;
			}
		}
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				dispatchEvent,
				location: {
					pathname: "/",
					search: "",
				},
			},
		});
		Object.defineProperty(globalThis, "CustomEvent", {
			configurable: true,
			value: MockCustomEvent,
		});
		const submitAwaitingImpl = jest.fn().mockResolvedValue({
			data: {
				accepted: true,
				continued: true,
				detail: "continued",
			},
		});
		const activeAwaiting: ActiveAwaiting = {
			key: "run_1#await_1",
			runId: "run_1",
			awaitingId: "await_1",
			agentKey: "agent_run",
			timeout: null,
			mode: "question",
			questions: [],
		};

		await submitComposerAwaiting({
			activeAwaiting,
			clearActiveAwaiting,
			dispatch,
			message: {
				info: jest.fn(),
				warning: jest.fn(),
			},
			payload: {
				runId: "run_1",
				awaitingId: "await_1",
				params: [],
			},
			state: {
				...createInitialState(),
				chatId: "chat_1",
			},
			t: (key) => key,
			createSubmitId: () => "submit_test",
			submitAwaitingImpl,
		});

		expect(submitAwaitingImpl).toHaveBeenCalledWith({
			chatId: "chat_1",
			runId: "run_1",
			owner: { kind: "agent", agentKey: "agent_run" },
			awaitingId: "await_1",
			submitId: "submit_test",
			params: [],
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "PATCH_ACTIVE_AWAITING",
			patch: {
				pendingSubmitId: "submit_test",
			},
		});
		expect(clearActiveAwaiting).toHaveBeenCalledTimes(1);
		expect(dispatch).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "SET_CURRENT_CHAT_ACTIVE_RUN",
			}),
		);
		expect(dispatch).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "SET_RUN_ID",
			}),
		);
		expect(
			dispatchEvent.mock.calls.filter(
				([event]) => (event as { type?: string }).type === "agent:attach-run",
			),
		).toHaveLength(0);
	});

	it.each([
		["awaiting_expired", "composer.awaiting.expired", "warning"],
		["awaiting_interrupted", "composer.awaiting.interrupted", "warning"],
		["already_resolved", "composer.awaiting.alreadyResolved", "info"],
	] as const)(
		"clears and reloads chat for structured terminal code %s",
		async (code, messageKey, messageMethod) => {
			const dispatch = jest.fn<void, [AppAction]>();
			const clearActiveAwaiting = jest.fn();
			const dispatchEvent = jest.fn();
			class MockCustomEvent {
				type: string;
				detail: unknown;

				constructor(type: string, init?: { detail?: unknown }) {
					this.type = type;
					this.detail = init?.detail;
				}
			}
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: {
					dispatchEvent,
					location: { pathname: "/", search: "" },
				},
			});
			Object.defineProperty(globalThis, "CustomEvent", {
				configurable: true,
				value: MockCustomEvent,
			});
			const info = jest.fn();
			const warning = jest.fn();
			const activeAwaiting: ActiveAwaiting = {
				key: "run_1#await_1",
				runId: "run_1",
				awaitingId: "await_1",
				agentKey: "agent_run",
				timeout: null,
				mode: "question",
				questions: [],
			};
			const submitAwaitingImpl = jest.fn().mockRejectedValue(new ApiError(code, {
				status: 409,
				platformError: {
					code,
					category: "tool_interaction",
					scope: "request",
					status: 409,
					retryable: false,
					message: code,
					diagnostics: null,
					raw: null,
					technicalText: code,
				},
			}));

			await submitComposerAwaiting({
				activeAwaiting,
				clearActiveAwaiting,
				dispatch,
				message: { info, warning },
				payload: {
					runId: "run_1",
					awaitingId: "await_1",
					params: [],
				},
				state: {
					...createInitialState(),
					chatId: "chat_1",
				},
				t: (key) => key,
				createSubmitId: () => "submit_test",
				submitAwaitingImpl,
			});

			expect(clearActiveAwaiting).toHaveBeenCalledTimes(1);
			expect(dispatch).toHaveBeenCalledWith({
				type: "SET_AWAITING_RUNTIME",
				activeAwaiting: null,
				pendingAwaitings: [],
			});
			expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
			expect(dispatch).toHaveBeenCalledWith({ type: "SET_ABORT_CONTROLLER", controller: null });
			expect(messageMethod === "info" ? info : warning).toHaveBeenCalledWith(messageKey);
			expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
				type: "agent:load-chat",
				detail: { chatId: "chat_1" },
			}));
		},
	);

	it("keeps compatibility with the legacy unknown awaitingId error message", async () => {
		const dispatch = jest.fn<void, [AppAction]>();
		const clearActiveAwaiting = jest.fn();
		const warning = jest.fn();
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: unknown;
			constructor(type: string, init?: { detail?: unknown }) {
				this.type = type;
				this.detail = init?.detail;
			}
		}
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				dispatchEvent,
				location: { pathname: "/", search: "" },
			},
		});
		Object.defineProperty(globalThis, "CustomEvent", {
			configurable: true,
			value: MockCustomEvent,
		});

		await submitComposerAwaiting({
			activeAwaiting: {
				key: "run_1#await_1",
				runId: "run_1",
				awaitingId: "await_1",
				agentKey: "agent_run",
				timeout: null,
				mode: "question",
				questions: [],
			},
			clearActiveAwaiting,
			dispatch,
			message: { info: jest.fn(), warning },
			payload: { runId: "run_1", awaitingId: "await_1", params: [] },
			state: { ...createInitialState(), chatId: "chat_1" },
			t: (key) => key,
			createSubmitId: () => "submit_test",
			submitAwaitingImpl: jest.fn().mockRejectedValue(new Error("unknown awaitingId")),
		});

		expect(warning).toHaveBeenCalledWith("composer.awaiting.expired");
		expect(clearActiveAwaiting).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_AWAITING_RUNTIME",
			activeAwaiting: null,
			pendingAwaitings: [],
		});
		expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
			type: "agent:load-chat",
		}));
	});
});

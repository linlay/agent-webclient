import { createInitialState } from "@/app/state/state";
import type { ActiveAwaiting } from "@/app/state/types";
import {
	buildPlanDecisionPlanningModeAction,
	resolveAwaitingSubmitAgentKey,
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

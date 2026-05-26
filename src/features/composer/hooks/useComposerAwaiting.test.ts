import { createInitialState } from "@/app/state/state";
import type { ActiveAwaiting } from "@/app/state/types";
import { resolveAwaitingSubmitAgentKey } from "@/features/composer/hooks/useComposerAwaiting";

describe("resolveAwaitingSubmitAgentKey", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: () => "",
			},
		});
	});

	it("uses run identity when awaiting.ask omitted agentKey", () => {
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
});

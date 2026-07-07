import type { AppAction } from "@/app/state/AppContext";
import { dispatchRunAttachDebugEvent } from "@/features/transport/lib/runAttachDebugEvents";

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("dispatchRunAttachDebugEvent", () => {
	const dispatch = jest.fn<void, [AppAction]>();

	beforeEach(() => {
		dispatch.mockReset();
		delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
		jest.spyOn(Date, "now").mockReturnValue(1234);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
	});

	it("does not dispatch run observation events when the flag is disabled", () => {
		dispatchRunAttachDebugEvent(dispatch, {
			stage: "attachRunRequested",
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "agent_alpha",
		});

		expect(dispatch).not.toHaveBeenCalled();
	});

	it("dispatches a unified run observation event when the flag is enabled", () => {
		globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
			DEBUG_RUN_OBSERVATION_ENABLED: "true",
		};

		dispatchRunAttachDebugEvent(dispatch, {
			stage: "attachRunRequested",
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "agent_alpha",
			reason: "retry",
			stateChatId: "chat_1",
			stateRunId: "run_old",
			stateStreaming: false,
			activeRequestId: "request_1",
			activeSessionRunId: "run_1",
			activeSessionStreaming: true,
			activeAttachRunId: "run_1",
			pathname: "/",
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "PUSH_EVENT",
			event: expect.objectContaining({
				type: "debug.runObservation",
				stage: "attachRunRequested",
				timestamp: 1234,
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "agent_alpha",
				reason: "retry",
				stateChatId: "chat_1",
				stateRunId: "run_old",
				stateStreaming: false,
				activeRequestId: "request_1",
				activeSessionRunId: "run_1",
				activeSessionStreaming: true,
				activeAttachRunId: "run_1",
				pathname: "/",
			}),
		});
	});
});

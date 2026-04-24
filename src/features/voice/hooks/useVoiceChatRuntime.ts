import { useMemo } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useAgentEventHandler } from "@/features/timeline/hooks/useAgentEventHandler";
import { useVoiceChatAsrTask } from "@/features/voice/hooks/useVoiceChatAsrTask";
import { useVoiceChatCapture } from "@/features/voice/hooks/useVoiceChatCapture";
import { useVoiceChatLifecycle } from "@/features/voice/hooks/useVoiceChatLifecycle";
import { useVoiceChatListening } from "@/features/voice/hooks/useVoiceChatListening";
import { useVoiceChatRuntimeController } from "@/features/voice/hooks/useVoiceChatRuntimeController";
import { useVoiceChatSocket } from "@/features/voice/hooks/useVoiceChatSocket";

export function useVoiceChatRuntime() {
	const { state, dispatch, stateRef } = useAppContext();
	const currentWorker = useMemo(
		() => resolveCurrentWorkerSummary(state),
		[state],
	);
	const { handleEvent } = useAgentEventHandler();
	const controller = useVoiceChatRuntimeController({
		dispatch,
		state,
		stateRef,
	});
	const { startAsrTask } = useVoiceChatAsrTask(controller);
	const { ensureAudioCapture, resumeAudioCapture } = useVoiceChatCapture({
		controller,
		state,
	});
	const {
		enterListeningReady,
		submitVoiceChatQuery,
	} = useVoiceChatListening({
		controller,
		currentWorker,
		dispatch,
		ensureAudioCapture,
		handleEvent,
		resumeAudioCapture,
		startAsrTask,
	});
	const { connectSocket, scheduleVoiceReconnect } = useVoiceChatSocket({
		controller,
		enterListeningReady,
		startAsrTask,
		submitVoiceChatQuery,
	});

	useVoiceChatLifecycle({
		connectSocket,
		controller,
		currentWorker,
		dispatch,
		scheduleVoiceReconnect,
		startAsrTask,
		state,
	});
}


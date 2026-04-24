import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";

export function reduceVoiceState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_AUDIO_MUTED":
			return { ...state, audioMuted: action.muted };
		case "SET_TTS_DEBUG_STATUS":
			return { ...state, ttsDebugStatus: action.status };
		case "SET_INPUT_MODE":
			return { ...state, inputMode: action.mode };
		case "PATCH_VOICE_CHAT":
			return {
				...state,
				voiceChat: {
					...state.voiceChat,
					...action.patch,
				},
			};
		default:
			return null;
	}
}

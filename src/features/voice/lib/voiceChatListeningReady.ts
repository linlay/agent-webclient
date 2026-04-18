export interface VoiceChatListeningReadyOptions {
	transitionId: number;
	resumeCapture: boolean;
	isCurrent: (transitionId: number) => boolean;
	waitForIdle: () => Promise<void>;
	playReadyCue: () => Promise<void>;
	ensureAudioCapture: () => Promise<boolean>;
	resumeAudioCapture: () => Promise<boolean>;
	onListeningReady: () => void;
}

export async function runVoiceChatListeningReady(
	options: VoiceChatListeningReadyOptions,
): Promise<boolean> {
	const {
		transitionId,
		resumeCapture,
		isCurrent,
		waitForIdle,
		playReadyCue,
		ensureAudioCapture,
		resumeAudioCapture,
		onListeningReady,
	} = options;

	if (resumeCapture) {
		await waitForIdle();
	}

	if (!isCurrent(transitionId)) {
		return false;
	}

	await playReadyCue();

	if (!isCurrent(transitionId)) {
		return false;
	}

	const captureReady = resumeCapture
		? await resumeAudioCapture()
		: await ensureAudioCapture();
	if (!captureReady || !isCurrent(transitionId)) {
		return false;
	}

	onListeningReady();
	return true;
}

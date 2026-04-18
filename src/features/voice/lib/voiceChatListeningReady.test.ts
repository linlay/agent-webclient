import { runVoiceChatListeningReady } from "@/features/voice/lib/voiceChatListeningReady";

describe("runVoiceChatListeningReady", () => {
	it("plays the ready cue before starting initial capture", async () => {
		const calls: string[] = [];

		const result = await runVoiceChatListeningReady({
			transitionId: 1,
			resumeCapture: false,
			isCurrent: () => true,
			waitForIdle: async () => {
				calls.push("wait");
			},
			playReadyCue: async () => {
				calls.push("cue");
			},
			ensureAudioCapture: async () => {
				calls.push("ensure");
				return true;
			},
			resumeAudioCapture: async () => {
				calls.push("resume");
				return true;
			},
			onListeningReady: () => {
				calls.push("ready");
			},
		});

		expect(result).toBe(true);
		expect(calls).toEqual(["cue", "ensure", "ready"]);
	});

	it("waits for playback idle, then cues, then resumes capture", async () => {
		const calls: string[] = [];

		const result = await runVoiceChatListeningReady({
			transitionId: 2,
			resumeCapture: true,
			isCurrent: () => true,
			waitForIdle: async () => {
				calls.push("wait");
			},
			playReadyCue: async () => {
				calls.push("cue");
			},
			ensureAudioCapture: async () => {
				calls.push("ensure");
				return true;
			},
			resumeAudioCapture: async () => {
				calls.push("resume");
				return true;
			},
			onListeningReady: () => {
				calls.push("ready");
			},
		});

		expect(result).toBe(true);
		expect(calls).toEqual(["wait", "cue", "resume", "ready"]);
	});

	it("stops before capture when the transition becomes stale", async () => {
		let currentTransition = 3;
		const calls: string[] = [];

		const result = await runVoiceChatListeningReady({
			transitionId: 3,
			resumeCapture: false,
			isCurrent: (transitionId) => transitionId === currentTransition,
			waitForIdle: async () => undefined,
			playReadyCue: async () => {
				calls.push("cue");
				currentTransition = 4;
			},
			ensureAudioCapture: async () => {
				calls.push("ensure");
				return true;
			},
			resumeAudioCapture: async () => {
				calls.push("resume");
				return true;
			},
			onListeningReady: () => {
				calls.push("ready");
			},
		});

		expect(result).toBe(false);
		expect(calls).toEqual(["cue"]);
	});
});

import {
	createVoiceAudioCaptureState,
	handleCapturedVoiceAudio,
	reapplyVoiceClientGateConfig,
	resetVoiceClientGateRuntime,
} from "./voiceAudioCapture";

function makeSamples(level: number, length = 1600): Float32Array {
	return new Float32Array(Array.from({ length }, () => level));
}

function makeBytes(length: number, value: number): Uint8Array {
	return new Uint8Array(Array.from({ length }, () => value));
}

describe("voiceAudioCapture client gate", () => {
	it("does not forward audio while input stays below threshold", () => {
		const state = createVoiceAudioCaptureState();
		const received: Uint8Array[] = [];

		resetVoiceClientGateRuntime(state.clientGate, {
			enabled: true,
			rmsThreshold: 0.5,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 100,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.02),
			makeBytes(3200, 1),
			(chunk) => received.push(chunk),
		);
		handleCapturedVoiceAudio(
			state,
			makeSamples(0.02),
			makeBytes(3200, 2),
			(chunk) => received.push(chunk),
		);

		expect(received).toEqual([]);
	});

	it("flushes pre-roll audio once the gate opens", () => {
		const state = createVoiceAudioCaptureState();
		const received: Uint8Array[] = [];

		resetVoiceClientGateRuntime(state.clientGate, {
			enabled: true,
			rmsThreshold: 0.1,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 200,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.02),
			makeBytes(3200, 1),
			(chunk) => received.push(chunk),
		);
		handleCapturedVoiceAudio(
			state,
			makeSamples(0.3),
			makeBytes(3200, 2),
			(chunk) => received.push(chunk),
		);

		const totalBytes = received.reduce((sum, chunk) => sum + chunk.length, 0);
		expect(totalBytes).toBe(6400);
		expect(state.clientGate.isOpen).toBe(true);
	});

	it("closes the gate after sustained silence", () => {
		const state = createVoiceAudioCaptureState();
		const received: Uint8Array[] = [];

		resetVoiceClientGateRuntime(state.clientGate, {
			enabled: true,
			rmsThreshold: 0.1,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 100,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.2),
			makeBytes(3200, 1),
			(chunk) => received.push(chunk),
		);
		handleCapturedVoiceAudio(
			state,
			makeSamples(0.01),
			makeBytes(3200, 2),
			(chunk) => received.push(chunk),
		);
		handleCapturedVoiceAudio(
			state,
			makeSamples(0.01),
			makeBytes(3200, 3),
			(chunk) => received.push(chunk),
		);

		const totalBytes = received.reduce((sum, chunk) => sum + chunk.length, 0);
		expect(totalBytes).toBe(6400);
		expect(state.clientGate.isOpen).toBe(false);
	});

	it("passes all audio through when disabled", () => {
		const state = createVoiceAudioCaptureState();
		const received: Uint8Array[] = [];

		resetVoiceClientGateRuntime(state.clientGate, {
			enabled: false,
			rmsThreshold: 0.5,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 0,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.01),
			makeBytes(1280, 1),
			(chunk) => received.push(chunk),
		);

		const totalBytes = received.reduce((sum, chunk) => sum + chunk.length, 0);
		expect(totalBytes).toBe(1280);
	});

	it("reapplies a stricter threshold immediately while the gate is open", () => {
		const state = createVoiceAudioCaptureState();
		const received: Uint8Array[] = [];

		resetVoiceClientGateRuntime(state.clientGate, {
			enabled: true,
			rmsThreshold: 0.1,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 100,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.2),
			makeBytes(3200, 1),
			(chunk) => received.push(chunk),
		);
		expect(state.clientGate.isOpen).toBe(true);

		reapplyVoiceClientGateConfig(state, {
			enabled: true,
			rmsThreshold: 0.3,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 100,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.2),
			makeBytes(3200, 2),
			(chunk) => received.push(chunk),
		);

		const totalBytes = received.reduce((sum, chunk) => sum + chunk.length, 0);
		expect(totalBytes).toBe(3200);
		expect(received.every((chunk) => Array.from(chunk).every((value) => value === 1))).toBe(true);
		expect(state.clientGate.isOpen).toBe(false);
	});

	it("starts gating immediately when re-enabled", () => {
		const state = createVoiceAudioCaptureState();
		const received: Uint8Array[] = [];

		resetVoiceClientGateRuntime(state.clientGate, {
			enabled: false,
			rmsThreshold: 0.5,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 0,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.01),
			makeBytes(1280, 1),
			(chunk) => received.push(chunk),
		);

		reapplyVoiceClientGateConfig(state, {
			enabled: true,
			rmsThreshold: 0.5,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 100,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.01),
			makeBytes(3200, 2),
			(chunk) => received.push(chunk),
		);

		const totalBytes = received.reduce((sum, chunk) => sum + chunk.length, 0);
		expect(totalBytes).toBe(1280);
		expect(state.clientGate.isOpen).toBe(false);
	});

	it("clears buffered remain and pre-roll when reapplying config", () => {
		const state = createVoiceAudioCaptureState();
		const received: Uint8Array[] = [];

		resetVoiceClientGateRuntime(state.clientGate, {
			enabled: true,
			rmsThreshold: 0.5,
			openHoldMs: 100,
			closeHoldMs: 100,
			preRollMs: 200,
		});
		state.remain = makeBytes(100, 9);

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.02),
			makeBytes(3200, 1),
			(chunk) => received.push(chunk),
		);
		expect(state.clientGate.preRollBytes).toBeGreaterThan(0);

		reapplyVoiceClientGateConfig(state, {
			enabled: false,
			rmsThreshold: 0,
			openHoldMs: 0,
			closeHoldMs: 0,
			preRollMs: 0,
		});

		handleCapturedVoiceAudio(
			state,
			makeSamples(0.2),
			makeBytes(3200, 2),
			(chunk) => received.push(chunk),
		);

		expect(state.remain).toEqual(new Uint8Array(0));
		expect(state.clientGate.preRollChunks).toEqual([]);
		expect(state.clientGate.preRollBytes).toBe(0);
		const totalBytes = received.reduce((sum, chunk) => sum + chunk.length, 0);
		expect(totalBytes).toBe(3200);
		expect(received.every((chunk) => Array.from(chunk).every((value) => value === 2))).toBe(true);
	});
});

import { VOICE_CHAT_FRAME_BYTES, encodePcm16 } from "@/features/voice/lib/voiceChatAudio";
import type { VoiceClientGateConfig } from "@/app/state/types";
import { DEFAULT_VOICE_CLIENT_GATE } from "@/features/voice/lib/voiceAsrProtocol";

const PCM16_BYTES_PER_MS = 32;

export interface VoiceClientGateRuntime {
	config: VoiceClientGateConfig;
	isOpen: boolean;
	openAccumulatedMs: number;
	closeAccumulatedMs: number;
	preRollChunks: Uint8Array[];
	preRollBytes: number;
}

export interface VoiceAudioCaptureState {
	stream: MediaStream | null;
	audioContext: AudioContext | null;
	source: MediaStreamAudioSourceNode | null;
	processor: ScriptProcessorNode | null;
	captureStarted: boolean;
	remain: Uint8Array;
	clientGate: VoiceClientGateRuntime;
}

export function createVoiceClientGateRuntime(
	config: VoiceClientGateConfig = DEFAULT_VOICE_CLIENT_GATE,
): VoiceClientGateRuntime {
	return {
		config,
		isOpen: false,
		openAccumulatedMs: 0,
		closeAccumulatedMs: 0,
		preRollChunks: [],
		preRollBytes: 0,
	};
}

export function resetVoiceClientGateRuntime(
	runtime: VoiceClientGateRuntime,
	config?: VoiceClientGateConfig,
): void {
	runtime.config = config || runtime.config;
	runtime.isOpen = false;
	runtime.openAccumulatedMs = 0;
	runtime.closeAccumulatedMs = 0;
	runtime.preRollChunks = [];
	runtime.preRollBytes = 0;
}

export function reapplyVoiceClientGateConfig(
	state: VoiceAudioCaptureState,
	config: VoiceClientGateConfig,
): void {
	state.remain = new Uint8Array(0);
	resetVoiceClientGateRuntime(state.clientGate, config);
}

export function calculateVoiceClientGateRms(samples: Float32Array): number {
	if (samples.length === 0) {
		return 0;
	}
	let sum = 0;
	for (let index = 0; index < samples.length; index += 1) {
		sum += samples[index] * samples[index];
	}
	return Math.sqrt(sum / samples.length);
}

export function createVoiceAudioCaptureState(): VoiceAudioCaptureState {
	return {
		stream: null,
		audioContext: null,
		source: null,
		processor: null,
		captureStarted: false,
		remain: new Uint8Array(0),
		clientGate: createVoiceClientGateRuntime(),
	};
}

export function cleanupVoiceAudioCapture(
	state: VoiceAudioCaptureState,
): void {
	state.captureStarted = false;
	if (state.processor) {
		state.processor.disconnect();
		state.processor.onaudioprocess = null;
		state.processor = null;
	}
	if (state.source) {
		state.source.disconnect();
		state.source = null;
	}
	if (state.audioContext) {
		void state.audioContext.close();
		state.audioContext = null;
	}
	if (state.stream) {
		state.stream.getTracks().forEach((track) => track.stop());
		state.stream = null;
	}
	state.remain = new Uint8Array(0);
	resetVoiceClientGateRuntime(state.clientGate);
}

export function emitChunkedVoiceAudio(
	bytes: Uint8Array,
	state: VoiceAudioCaptureState,
	onChunk: (chunk: Uint8Array) => void,
): void {
	const merged = new Uint8Array(state.remain.length + bytes.length);
	merged.set(state.remain, 0);
	merged.set(bytes, state.remain.length);

	let offset = 0;
	while (offset + VOICE_CHAT_FRAME_BYTES <= merged.length) {
		onChunk(merged.slice(offset, offset + VOICE_CHAT_FRAME_BYTES));
		offset += VOICE_CHAT_FRAME_BYTES;
	}
	state.remain = merged.slice(offset);
}

export function flushVoiceAudioCaptureRemainder(
	state: VoiceAudioCaptureState,
	onChunk: (chunk: Uint8Array) => void,
): void {
	if (state.remain.length === 0) return;
	onChunk(state.remain);
	state.remain = new Uint8Array(0);
}

function bufferVoiceClientGatePreRoll(
	runtime: VoiceClientGateRuntime,
	bytes: Uint8Array,
): void {
	if (runtime.config.preRollMs <= 0 || bytes.length === 0) {
		runtime.preRollChunks = [];
		runtime.preRollBytes = 0;
		return;
	}

	runtime.preRollChunks.push(bytes);
	runtime.preRollBytes += bytes.length;

	const maxBytes = Math.max(
		0,
		Math.floor(runtime.config.preRollMs * PCM16_BYTES_PER_MS),
	);
	while (runtime.preRollBytes > maxBytes && runtime.preRollChunks.length > 0) {
		const first = runtime.preRollChunks[0];
		const overflow = runtime.preRollBytes - maxBytes;
		if (first.length <= overflow) {
			runtime.preRollChunks.shift();
			runtime.preRollBytes -= first.length;
			continue;
		}
		runtime.preRollChunks[0] = first.slice(overflow);
		runtime.preRollBytes -= overflow;
	}
}

function flushVoiceClientGatePreRoll(
	state: VoiceAudioCaptureState,
	onChunk: (chunk: Uint8Array) => void,
): void {
	for (const chunk of state.clientGate.preRollChunks) {
		emitChunkedVoiceAudio(chunk, state, onChunk);
	}
	state.clientGate.preRollChunks = [];
	state.clientGate.preRollBytes = 0;
}

export function handleCapturedVoiceAudio(
	state: VoiceAudioCaptureState,
	input: Float32Array,
	bytes: Uint8Array,
	onChunk: (chunk: Uint8Array) => void,
): void {
	const runtime = state.clientGate;
	if (!runtime.config.enabled) {
		emitChunkedVoiceAudio(bytes, state, onChunk);
		return;
	}

	const frameDurationMs = bytes.length / PCM16_BYTES_PER_MS;
	if (frameDurationMs <= 0) {
		return;
	}

	const aboveThreshold =
		calculateVoiceClientGateRms(input) >= runtime.config.rmsThreshold;

	if (!runtime.isOpen) {
		bufferVoiceClientGatePreRoll(runtime, bytes);
		runtime.closeAccumulatedMs = 0;
		runtime.openAccumulatedMs = aboveThreshold
			? runtime.openAccumulatedMs + frameDurationMs
			: 0;
		if (
			!aboveThreshold ||
			runtime.openAccumulatedMs < runtime.config.openHoldMs
		) {
			return;
		}
		runtime.isOpen = true;
		runtime.openAccumulatedMs = 0;
		flushVoiceClientGatePreRoll(state, onChunk);
		return;
	}

	emitChunkedVoiceAudio(bytes, state, onChunk);
	if (aboveThreshold) {
		runtime.closeAccumulatedMs = 0;
		return;
	}

	runtime.closeAccumulatedMs += frameDurationMs;
	if (runtime.closeAccumulatedMs >= runtime.config.closeHoldMs) {
		runtime.isOpen = false;
		runtime.openAccumulatedMs = 0;
		runtime.closeAccumulatedMs = 0;
		runtime.preRollChunks = [];
		runtime.preRollBytes = 0;
	}
}

export async function initializeVoiceAudioCapture(
	state: VoiceAudioCaptureState,
	onChunk: (chunk: Uint8Array) => void,
	onError: (message: string) => void,
	clientGateConfig: VoiceClientGateConfig = DEFAULT_VOICE_CLIENT_GATE,
): Promise<boolean> {
	if (state.captureStarted) return true;
	state.captureStarted = true;
	reapplyVoiceClientGateConfig(state, clientGateConfig);

	try {
		const mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});
		state.stream = mediaStream;

		const AudioContextCtor =
			window.AudioContext ||
			(
				window as typeof window & {
					webkitAudioContext?: typeof AudioContext;
				}
			).webkitAudioContext;
		if (AudioContextCtor == null) {
			throw new Error("当前浏览器不支持 AudioContext");
		}

		const audioContext = new AudioContextCtor();
		state.audioContext = audioContext;

		const source = audioContext.createMediaStreamSource(mediaStream);
		state.source = source;

		const processor = audioContext.createScriptProcessor(4096, 1, 1);
		state.processor = processor;
		processor.onaudioprocess = (event) => {
			if (!state.captureStarted) return;
			const input = event.inputBuffer.getChannelData(0);
			const pcm16 = encodePcm16(input, audioContext.sampleRate, 16000);
			handleCapturedVoiceAudio(
				state,
				input,
				new Uint8Array(pcm16.buffer),
				onChunk,
			);
		};

		source.connect(processor);
		processor.connect(audioContext.destination);
		return true;
	} catch (error) {
		cleanupVoiceAudioCapture(state);
		onError(
			`麦克风初始化失败: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

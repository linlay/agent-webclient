import { VOICE_CHAT_FRAME_BYTES, encodePcm16 } from "./voiceChatAudio";

export interface VoiceAudioCaptureState {
	stream: MediaStream | null;
	audioContext: AudioContext | null;
	source: MediaStreamAudioSourceNode | null;
	processor: ScriptProcessorNode | null;
	captureStarted: boolean;
	remain: Uint8Array;
}

export function createVoiceAudioCaptureState(): VoiceAudioCaptureState {
	return {
		stream: null,
		audioContext: null,
		source: null,
		processor: null,
		captureStarted: false,
		remain: new Uint8Array(0),
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

export async function initializeVoiceAudioCapture(
	state: VoiceAudioCaptureState,
	onChunk: (chunk: Uint8Array) => void,
	onError: (message: string) => void,
): Promise<boolean> {
	if (state.captureStarted) return true;
	state.captureStarted = true;

	try {
		const mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: true,
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
			emitChunkedVoiceAudio(new Uint8Array(pcm16.buffer), state, onChunk);
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

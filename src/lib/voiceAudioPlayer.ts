import type { TtsVoiceBlock } from "../context/types";

export const DEFAULT_SAMPLE_RATE = 24000;
export const DEFAULT_CHANNELS = 1;

export interface VoiceAudioPlayerContext {
	audioContext: AudioContext | null;
	playbackCursor: number;
	activeAudioRequestId: string;
	activeSampleRate: number;
	activeChannels: number;
	debugTtsRequest: { requestId: string } | null;
	appendDebug: (message: string) => void;
	setDebugStatus: (status: string) => void;
	setDebugStatusWithStats: (status: string) => void;
	updateBlockByRequestId: (requestId: string, patch: Partial<TtsVoiceBlock>) => void;
	handleAudioBytes: (byteLength: number) => void;
}

export function isArrayBufferView(value: unknown): value is ArrayBufferView {
	return Boolean(value && typeof value === "object" && ArrayBuffer.isView(value as ArrayBufferView));
}

export function ensureAudioContext(context: VoiceAudioPlayerContext): AudioContext | null {
	if (context.audioContext) return context.audioContext;
	const Ctor = globalThis.window?.AudioContext
		|| (globalThis.window as unknown as { webkitAudioContext?: typeof AudioContext })?.webkitAudioContext;
	if (!Ctor) return null;
	try {
		context.audioContext = new Ctor();
		context.playbackCursor = 0;
		return context.audioContext;
	} catch (error) {
		context.appendDebug(`voice audio context create failed: ${(error as Error).message}`);
		return null;
	}
}

export async function prepareAudioPlayback(context: VoiceAudioPlayerContext): Promise<AudioContext> {
	const audioContext = ensureAudioContext(context);
	if (!audioContext) {
		throw new Error("browser audio context unavailable");
	}
	if (audioContext.state === "suspended" && typeof audioContext.resume === "function") {
		try {
			await audioContext.resume();
		} catch (error) {
			throw new Error(`audio resume failed: ${(error as Error).message}`);
		}
	}
	if (audioContext.state === "suspended") {
		throw new Error("audio context is still suspended");
	}
	return audioContext;
}

export function resetPlayback(context: VoiceAudioPlayerContext): void {
	context.playbackCursor = 0;
	if (!context.audioContext) return;
	try {
		const closePromise = context.audioContext.close?.();
		if (closePromise && typeof closePromise.catch === "function") closePromise.catch(() => undefined);
	} catch {
		/* no-op */
	} finally {
		context.audioContext = null;
	}
}

export function playPcm(context: VoiceAudioPlayerContext, bufferLike: ArrayBuffer | ArrayBufferView): boolean {
	const audioContext = ensureAudioContext(context);
	if (!audioContext) {
		context.setDebugStatus("error: browser audio context unavailable");
		return false;
	}
	if (audioContext.state === "suspended") {
		context.setDebugStatus("error: audio context is suspended");
		return false;
	}
	const bytes = isArrayBufferView(bufferLike)
		? new Uint8Array(bufferLike.buffer, bufferLike.byteOffset, bufferLike.byteLength)
		: new Uint8Array(bufferLike);
	const sampleRate = Math.max(8000, Number(context.activeSampleRate) || DEFAULT_SAMPLE_RATE);
	const channels = Math.max(1, Number(context.activeChannels) || DEFAULT_CHANNELS);
	if (bytes.length < 2) return false;

	const sampleCount = Math.floor(bytes.length / 2);
	const frameCount = Math.floor(sampleCount / channels);
	if (frameCount <= 0) return false;

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const audioBuffer = audioContext.createBuffer(channels, frameCount, sampleRate);
	for (let channel = 0; channel < channels; channel += 1) {
		const output = audioBuffer.getChannelData(channel);
		for (let i = 0; i < frameCount; i += 1) {
			const sampleIndex = (i * channels + channel) * 2;
			const sample = view.getInt16(sampleIndex, true) / 32768;
			output[i] = Math.max(-1, Math.min(1, sample));
		}
	}

	const source = audioContext.createBufferSource();
	source.buffer = audioBuffer;
	source.connect(audioContext.destination);
	const now = audioContext.currentTime + 0.01;
	const startAt = Math.max(now, context.playbackCursor || 0);
	source.start(startAt);
	context.playbackCursor = startAt + audioBuffer.duration;

	if (context.activeAudioRequestId) {
		context.updateBlockByRequestId(context.activeAudioRequestId, { status: "playing", error: "" });
	}
	if (context.debugTtsRequest?.requestId === context.activeAudioRequestId) {
		context.setDebugStatusWithStats("playing");
	}
	return true;
}

export function handleSocketBinary(context: VoiceAudioPlayerContext, data: unknown): void {
	if (typeof Blob !== "undefined" && data instanceof Blob) {
		data.arrayBuffer()
			.then((buffer) => {
				context.handleAudioBytes(buffer.byteLength);
				playPcm(context, buffer);
			})
			.catch((error) => context.appendDebug(`voice blob decode failed: ${(error as Error).message}`));
		return;
	}
	if (data instanceof ArrayBuffer || isArrayBufferView(data)) {
		context.handleAudioBytes(data.byteLength);
		playPcm(context, data);
	}
}

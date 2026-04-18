const MIN_GAIN = 0.0001;

export const VOICE_CHAT_FRAME_BYTES = 640;
export const DEFAULT_VOICE_CHAT_SEND_PAUSE_MS = 1500;

type BrowserWindow = typeof window & {
	webkitAudioContext?: typeof AudioContext;
};

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

export function downsampleBuffer(
	input: Float32Array,
	inputSampleRate: number,
	outputSampleRate = 16000,
): Float32Array {
	if (outputSampleRate === inputSampleRate) {
		return input;
	}
	if (outputSampleRate > inputSampleRate) {
		throw new Error("Output sample rate should be lower than input sample rate.");
	}

	const sampleRateRatio = inputSampleRate / outputSampleRate;
	const newLength = Math.round(input.length / sampleRateRatio);
	const result = new Float32Array(newLength);

	let offsetResult = 0;
	let offsetBuffer = 0;
	while (offsetResult < result.length) {
		const nextOffsetBuffer = Math.round(
			(offsetResult + 1) * sampleRateRatio,
		);
		let accum = 0;
		let count = 0;

		for (
			let i = offsetBuffer;
			i < nextOffsetBuffer && i < input.length;
			i += 1
		) {
			accum += input[i];
			count += 1;
		}

		result[offsetResult] = count > 0 ? accum / count : 0;
		offsetResult += 1;
		offsetBuffer = nextOffsetBuffer;
	}

	return result;
}

export function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
	const output = new Int16Array(float32Array.length);
	for (let i = 0; i < float32Array.length; i += 1) {
		const sample = Math.max(-1, Math.min(1, float32Array[i]));
		output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
	}
	return output;
}

export function encodePcm16(
	float32Array: Float32Array,
	inputSampleRate: number,
	targetSampleRate = 16000,
): Int16Array {
	return floatTo16BitPCM(
		downsampleBuffer(float32Array, inputSampleRate, targetSampleRate),
	);
}

export function mergeVoiceChatUtterance(
	current: string,
	next: string,
): string {
	const left = current.trimEnd();
	const right = next.trimStart();
	if (!left) return right;
	if (!right) return left;
	const needsSpace =
		/[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
	return `${left}${needsSpace ? " " : ""}${right}`;
}

export function normalizeVoiceChatUtteranceForLength(text: string): string {
	return text
		.trim()
		.replace(
			/[\s\u3000!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~\-，。！？、；：,.·!?"“”'‘’（）()【】《》〈〉「」『』…—]+/g,
			"",
		);
}

export function resolveVoiceChatWsUrl(
	rawPath: string,
	accessToken = "",
): string {
	const normalizedPath = String(rawPath || "").trim() || "/api/voice/ws";
	const base =
		window.location.protocol === "https:" ? "wss:" : "ws:";
	const url = new URL(`${base}//${window.location.host}${normalizedPath}`);
	const token = String(accessToken || "").trim();
	if (token) {
		url.searchParams.set("access_token", token);
	}
	return url.toString();
}

export function describeVoiceChatWsTarget(rawPath: string): string {
	const normalizedPath = String(rawPath || "").trim() || "/api/voice/ws";
	const base =
		window.location.protocol === "https:" ? "wss:" : "ws:";
	const url = new URL(`${base}//${window.location.host}${normalizedPath}`);
	url.search = "";
	return url.toString();
}

export class PcmQueuePlayer {
	private audioContext: AudioContext | null = null;
	private nextPlayTime = 0;
	private activeSources = new Set<AudioBufferSourceNode>();
	private muted = false;

	async init(): Promise<void> {
		if (this.audioContext == null) {
			const AudioContextCtor =
				window.AudioContext ||
				(window as BrowserWindow).webkitAudioContext;
			if (AudioContextCtor == null) {
				throw new Error("当前浏览器不支持 AudioContext");
			}
			this.audioContext = new AudioContextCtor();
		}
		if (this.audioContext.state === "suspended") {
			await this.audioContext.resume();
		}
	}

	async enqueue(
		pcm16le: ArrayBuffer,
		sampleRate: number,
		channels: number,
	): Promise<void> {
		if (this.muted) return;
		await this.init();
		const ctx = this.audioContext;
		if (ctx == null) return;

		const int16 = new Int16Array(pcm16le);
		if (int16.length === 0) return;

		const frameCount = Math.floor(int16.length / channels);
		if (frameCount <= 0) return;

		const buffer = ctx.createBuffer(channels, frameCount, sampleRate);
		for (let channel = 0; channel < channels; channel += 1) {
			const channelData = buffer.getChannelData(channel);
			for (let i = 0; i < frameCount; i += 1) {
				const sample = int16[i * channels + channel] ?? 0;
				channelData[i] = sample / 32768;
			}
		}

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		this.activeSources.add(source);
		source.onended = () => {
			this.activeSources.delete(source);
		};

		const now = ctx.currentTime + 0.05;
		if (this.nextPlayTime < now) {
			this.nextPlayTime = now;
		}
		source.start(this.nextPlayTime);
		this.nextPlayTime += buffer.duration;
	}

	async waitForIdle(): Promise<void> {
		const ctx = this.audioContext;
		if (ctx == null || this.nextPlayTime <= 0) return;

		const remainingMs = Math.max(
			0,
			(this.nextPlayTime - ctx.currentTime) * 1000,
		);
		if (remainingMs <= 0) return;
		await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
	}

	resetQueue(): void {
		this.nextPlayTime = 0;
	}

	stopAll(): void {
		this.nextPlayTime = 0;
		for (const source of this.activeSources) {
			try {
				source.stop();
			} catch {
				/* no-op */
			}
			source.disconnect();
		}
		this.activeSources.clear();
	}

	setMuted(muted: boolean): void {
		this.muted = Boolean(muted);
		if (this.muted) {
			this.stopAll();
		}
	}
}

export class ReadyCuePlayer {
	private audioContext: AudioContext | null = null;
	private activeOscillator: OscillatorNode | null = null;
	private activeGainNode: GainNode | null = null;
	private muted = false;

	async prime(): Promise<void> {
		if (this.audioContext == null) {
			const AudioContextCtor =
				window.AudioContext ||
				(window as BrowserWindow).webkitAudioContext;
			if (AudioContextCtor == null) {
				throw new Error("当前浏览器不支持 AudioContext");
			}
			this.audioContext = new AudioContextCtor();
		}
		if (this.audioContext.state === "suspended") {
			await this.audioContext.resume();
		}
	}

	async playReadyCue(): Promise<void> {
		if (this.muted) return;
		await this.prime();
		const ctx = this.audioContext;
		if (ctx == null) return;

		this.stop();

		const oscillator = ctx.createOscillator();
		const gainNode = ctx.createGain();
		const startAt = ctx.currentTime + 0.005;
		const attackEndAt = startAt + 0.01;
		const stopAt = startAt + 0.14;
		const releaseStartAt = stopAt - 0.03;

		oscillator.type = "sine";
		oscillator.frequency.setValueAtTime(880, startAt);

		gainNode.gain.setValueAtTime(MIN_GAIN, startAt);
		gainNode.gain.linearRampToValueAtTime(0.035, attackEndAt);
		gainNode.gain.linearRampToValueAtTime(0.02275, releaseStartAt);
		gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN, stopAt);

		oscillator.connect(gainNode);
		gainNode.connect(ctx.destination);

		this.activeOscillator = oscillator;
		this.activeGainNode = gainNode;

		await new Promise<void>((resolve) => {
			oscillator.onended = () => {
				if (this.activeOscillator === oscillator) {
					this.activeOscillator = null;
				}
				if (this.activeGainNode === gainNode) {
					this.activeGainNode = null;
				}
				oscillator.disconnect();
				gainNode.disconnect();
				resolve();
			};

			oscillator.start(startAt);
			oscillator.stop(stopAt);
		});
	}

	stop(): void {
		const oscillator = this.activeOscillator;
		const gainNode = this.activeGainNode;

		this.activeOscillator = null;
		this.activeGainNode = null;

		if (oscillator != null) {
			try {
				oscillator.stop();
			} catch {
				/* no-op */
			}
			oscillator.disconnect();
		}
		if (gainNode != null) {
			gainNode.disconnect();
		}
	}

	setMuted(muted: boolean): void {
		this.muted = Boolean(muted);
		if (this.muted) {
			this.stop();
		}
	}
}

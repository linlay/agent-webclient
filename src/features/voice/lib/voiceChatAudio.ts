export const VOICE_CHAT_FRAME_BYTES = 640;

export function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
	const output = new Int16Array(float32Array.length);
	for (let i = 0; i < float32Array.length; i += 1) {
		const sample = Math.max(-1, Math.min(1, float32Array[i]));
		output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
	}
	return output;
}

// Carry the fractional sample interval between callbacks (including 44.1kHz).
export class Pcm16Encoder {
  private filled = 0;
  private sum = 0;
  private readonly ratio: number;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate < 16000) throw new Error("Unsupported microphone sample rate");
    this.ratio = sampleRate / 16000;
  }

  encode(input: Float32Array): Uint8Array {
    const samples: number[] = [];
    for (const value of input) {
      let remaining = 1;
      while (remaining > 1e-9) {
        const weight = Math.min(remaining, this.ratio - this.filled);
        this.sum += value * weight;
        this.filled += weight;
        remaining -= weight;
        if (this.filled >= this.ratio - 1e-9) {
          samples.push(this.sum / this.ratio);
          this.filled = 0;
          this.sum = 0;
        }
      }
    }
    const pcm = floatTo16BitPCM(new Float32Array(samples));
    const bytes = new Uint8Array(pcm.length * 2);
    const view = new DataView(bytes.buffer);
    pcm.forEach((value, i) => view.setInt16(i * 2, value, true));
    return bytes;
  }
}

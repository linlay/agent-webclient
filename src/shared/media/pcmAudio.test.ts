import { Pcm16Encoder } from "./pcmAudio";

it.each([16000, 44100, 48000])("keeps exactly one second at 16kHz across arbitrary %iHz callbacks", sampleRate => {
  const encoder = new Pcm16Encoder(sampleRate);
  const input = new Float32Array(sampleRate).fill(.25);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < input.length; i += 1024) chunks.push(encoder.encode(input.subarray(i, i + 1024)));
  expect(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)).toBe(32000);
  for (const chunk of chunks) {
    const view = new DataView(chunk.buffer);
    for (let i = 0; i < chunk.byteLength; i += 2) expect(view.getInt16(i, true)).toBe(8191);
  }
});

it("clamps PCM and uses little endian", () => {
  expect([...new Pcm16Encoder(16000).encode(new Float32Array([-2, 0, 2]))]).toEqual([0, 128, 0, 0, 255, 127]);
});

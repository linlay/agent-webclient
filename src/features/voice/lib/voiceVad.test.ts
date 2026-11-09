/** @jest-environment jsdom */
import { VoiceVad } from "./voiceVad";
import { Silero } from "@ricky0123/vad-web/dist/models/silero";
import * as ort from "onnxruntime-web/wasm";

jest.mock("onnxruntime-web/wasm", () => ({ env: { wasm: {} } }));
jest.mock("@ricky0123/vad-web/dist/models/silero", () => ({ Silero: { new: jest.fn() } }));
const model = { process: jest.fn(async (_frame: Float32Array) => ({ isSpeech: .9, notSpeech: .1 })), reset_state: jest.fn(), release: jest.fn(async () => undefined) };
const pcm = new Uint8Array(1024);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => { jest.clearAllMocks(); model.process.mockReset().mockResolvedValue({ isSpeech: .9, notSpeech: .1 }); jest.mocked(Silero.new).mockResolvedValue(model); });

it("confirms onset after 160ms with the actual frame processor, without waiting for speech end", async () => {
  const detected = jest.fn(), failed = jest.fn();
  const vad = await VoiceVad.create(detected, failed, new AbortController().signal);
  expect(ort.env.wasm).toMatchObject({ numThreads: 1, proxy: false, wasmPaths: expect.stringContaining('/assets/voice-vad/0.0.31-1.22.0/') });
  vad.setActive(true);
  for (let i = 1; i <= 4; i++) { vad.push(pcm, i * 32); await flush(); }
  expect(detected).not.toHaveBeenCalled();
  vad.push(pcm, 160); await flush();
  expect(detected).toHaveBeenCalledWith(0);
  expect(failed).not.toHaveBeenCalled();
  await vad.close(); await vad.close(); expect(model.release).toHaveBeenCalledTimes(1);
});

it("discards an in-flight result after disable and releases only after inference finishes", async () => {
  let finish!: (result: { isSpeech: number; notSpeech: number }) => void;
  const detected = jest.fn(), failed = jest.fn();
  const vad = await VoiceVad.create(detected, failed, new AbortController().signal); vad.setActive(true);
  for (let i = 0; i < 4; i++) { vad.push(pcm, i * 32); await flush(); }
  model.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  vad.push(pcm, 160); const closing = vad.close();
  expect(model.release).not.toHaveBeenCalled();
  finish({ isSpeech: .9, notSpeech: .1 }); await closing;
  expect(detected).not.toHaveBeenCalled(); expect(model.release).toHaveBeenCalledTimes(1);
});

it("bounds inference backlog to 256ms and reports failure instead of detecting late", async () => {
  let finish!: (result: { isSpeech: number; notSpeech: number }) => void;
  model.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const detected = jest.fn(), failed = jest.fn();
  const vad = await VoiceVad.create(detected, failed, new AbortController().signal); vad.setActive(true);
  for (let i = 0; i < 10; i++) vad.push(pcm, i * 32);
  expect(failed).toHaveBeenCalledTimes(1);
  finish({ isSpeech: .9, notSpeech: .1 }); await flush();
  expect(detected).not.toHaveBeenCalled(); expect(model.process).toHaveBeenCalledTimes(1);
  await vad.close();
});

it("releases a model whose initialization completes after cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(VoiceVad.create(jest.fn(), jest.fn(), controller.signal)).rejects.toThrow("cancelled");
  expect(model.release).toHaveBeenCalledTimes(1);
});

it("reports inference errors and stops accepting frames", async () => {
  model.process.mockRejectedValueOnce(new Error("inference failed"));
  const failed = jest.fn(), detected = jest.fn();
  const vad = await VoiceVad.create(detected, failed, new AbortController().signal); vad.setActive(true);
  vad.push(pcm, 32); await flush(); vad.push(pcm, 64); await flush();
  expect(failed).toHaveBeenCalledTimes(1); expect(model.process).toHaveBeenCalledTimes(1);
  await vad.close();
});

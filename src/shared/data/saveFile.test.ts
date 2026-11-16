import { Blob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { saveBlob, saveResponse } from "./saveFile";
import { DESKTOP_FILE_SAVE_GLOBAL, DESKTOP_FILE_SAVE_CHUNK_BYTES, type DesktopFileSaveRequest } from "@/shared/contracts/generated/agentWebclientBridge";
let mockDesktop = true;
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: () => mockDesktop }));
jest.mock("@/shared/i18n", () => ({ t: (key: string) => key }));
const host = jest.fn();
const blob = (bytes: number) => new Blob([Buffer.alloc(bytes, 97)]) as unknown as globalThis.Blob;
beforeEach(() => {
  mockDesktop = true; host.mockReset();
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { [DESKTOP_FILE_SAVE_GLOBAL]: { version: 1, request: host } }, configurable: true });
  host.mockImplementation(async (input: DesktopFileSaveRequest) => ({ status: input.operation === "commit" ? "saved" : input.operation === "cancel" ? "canceled" : "writing" }));
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
it("waits for commit acknowledgment before reporting saved", async () => {
  const commit = deferred<{ status: string }>();
  host.mockImplementation(async (input: DesktopFileSaveRequest) => input.operation === "commit" ? commit.promise : { status: "writing" });
  let done = false; const save = saveBlob(blob(1), { filename: "x" }).then(value => { done = true; return value; });
  while (!host.mock.calls.some(([input]) => input.operation === "commit")) await new Promise(r => setImmediate(r));
  expect(done).toBe(false); commit.resolve({ status: "saved" }); expect(await save).toEqual({ status: "saved" });
});
it("cancellation never sends file content", async () => {
  host.mockResolvedValue({ status: "canceled" });
  expect(await saveBlob(blob(10), { filename: "x" })).toEqual({ status: "canceled" });
  expect(host.mock.calls.some(([input]) => input.operation === "chunk")).toBe(false);
});
it("saves files above 64 MiB without increasing message size", async () => {
  expect(await saveBlob(blob(65 * 1024 * 1024), { filename: "large.bin" })).toEqual({ status: "saved" });
  const chunks = host.mock.calls.filter(([input]) => input.operation === "chunk").map(([input]) => input);
  expect(chunks).toHaveLength(260);
  for (const [index, chunk] of chunks.entries()) {
    expect(chunk.sequence).toBe(index);
    expect(Buffer.from(chunk.dataBase64, "base64").length).toBeLessThanOrEqual(DESKTOP_FILE_SAVE_CHUNK_BYTES);
  }
});
it("does not disguise write failures as cancellation", async () => {
  host.mockImplementation(async (input: DesktopFileSaveRequest) => ({ status: input.operation === "begin" ? "writing" : "failed", message: "save_io_error" }));
  await expect(saveBlob(blob(1), { filename: "x" })).rejects.toThrow("api.saveFailed");
});
it("missing or old host requests an upgrade without browser fallback", async () => {
  delete (window as unknown as Record<string, unknown>)[DESKTOP_FILE_SAVE_GLOBAL];
  await expect(saveBlob(blob(1), { filename: "x" })).rejects.toThrow("api.saveUpgradeRequired");
});
it("aborting an open dialog requests cancellation and ignores late confirmation", async () => {
  const begin = deferred<{ status: string }>(); const abort = new AbortController();
  host.mockImplementation(async (input: DesktopFileSaveRequest) => input.operation === "begin" ? begin.promise : { status: "canceled" });
  const save = saveBlob(blob(1), { filename: "x", signal: abort.signal });
  abort.abort(); await flush(); begin.resolve({ status: "canceled" });
  expect(await save).toEqual({ status: "canceled" });
  expect(host.mock.calls.some(([input]) => input.operation === "chunk")).toBe(false);
});
it("streams network content only after dialog and previous chunk acknowledgment", async () => {
  const begin = deferred<{ status: string }>(); const chunk = deferred<{ status: string }>();
  const read = jest.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array([1]) }).mockResolvedValue({ done: true });
  const cancel = jest.fn().mockResolvedValue(undefined); const releaseLock = jest.fn();
  host.mockImplementation(async (input: DesktopFileSaveRequest) => input.operation === "begin" ? begin.promise : input.operation === "chunk" ? chunk.promise : { status: "saved" });
  const response = { body: { getReader: () => ({ read, cancel, releaseLock }) }, headers: new Headers(), blob: jest.fn() };
  const save = saveResponse(response as unknown as Response, { filename: "x" });
  await flush(); expect(read).not.toHaveBeenCalled(); begin.resolve({ status: "writing" });
  await flush(); expect(read).toHaveBeenCalledTimes(1);
  chunk.resolve({ status: "writing" }); expect(await save).toEqual({ status: "saved" });
  expect(response.blob).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalled();
});
it("keeps a late successful commit successful even when IPC delivery fails", async () => {
  host.mockImplementation(async (input: DesktopFileSaveRequest) => {
    if (input.operation === "commit") throw new Error("delivery failed");
    return { status: input.operation === "cancel" ? "saved" : "writing" };
  });
  expect(await saveBlob(blob(0), { filename: "x" })).toEqual({ status: "saved" });
});

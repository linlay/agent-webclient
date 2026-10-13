/** @jest-environment jsdom */
import {
  completeDesktopNativeShare,
  parseDesktopNativeShareTarget,
  readDesktopNativeShare,
  readDesktopNativeShareFiles,
} from "./desktopNativeShare";
import {
  AGENT_WEBCLIENT_NATIVE_SHARE_CHUNK_BYTES,
  AGENT_WEBCLIENT_NATIVE_SHARE_MAX_BYTES,
  AGENT_WEBCLIENT_NATIVE_SHARE_READ_RESPONSE_TYPE,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { postDesktopHostMessage } from "./desktopHostBridge";

jest.mock("./desktopHostBridge", () => ({
  hasDesktopHostBridge: () => true,
  isDesktopHostMessageEvent: (event: MessageEvent) => event.source === window,
  postDesktopHostMessage: jest.fn(),
}));

const post = postDesktopHostMessage as jest.Mock;
const target = { agentKey: "cutej", newChat: "1791788400000", batchId: "36f00671-a11c-4417-bdfa-502d2a14de3b" };

function reply(message: any, result: unknown, source: Window = window) {
  window.dispatchEvent(new MessageEvent("message", {
    source,
    data: { type: AGENT_WEBCLIENT_NATIVE_SHARE_READ_RESPONSE_TYPE, requestId: message.requestId, nativeShareResult: result },
  }));
}

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

beforeEach(() => post.mockReset());
afterEach(() => jest.useRealTimers());

it("accepts only a unique share batch and new Chat on the Agent route", () => {
  const search = `?newChat=${target.newChat}&shareBatch=${target.batchId}`;
  expect(parseDesktopNativeShareTarget("/agent/cutej", search)).toEqual(target);
  for (const invalid of [
    `${search}&newChat=${target.newChat}`, `${search}&shareBatch=${target.batchId}`, `${search}&chatId=history`,
    search.replace(target.newChat, "true"), search.replace(target.batchId, "../../private"),
  ]) expect(parseDesktopNativeShareTarget("/agent/cutej", invalid)).toBeNull();
  expect(parseDesktopNativeShareTarget("/agent/cutej/new-chat", search)).toBeNull();
  expect(parseDesktopNativeShareTarget("/copilot/cutej", search)).toBeNull();
  expect(parseDesktopNativeShareTarget("/agent/a%2Fb", search)).toBeNull();
});

it("reads exact bounded chunks, preserves ZIP bytes, and does not acknowledge a memory-only draft", async () => {
  const zip = Buffer.alloc(AGENT_WEBCLIENT_NATIVE_SHARE_CHUNK_BYTES + 9, 0x71);
  zip.set([0x50, 0x4b, 0x03, 0x04]);
  const reads: Array<{ fileIndex: number; offset: number }> = [];
  post.mockImplementation(message => {
    const request = message.nativeShareRequest;
    let result: unknown;
    if (request.operation === "describe") {
      result = { ok: true, batchId: target.batchId, files: [
        { name: "微信聊天.zip", sizeBytes: zip.length, mimeType: "application/zip" },
        { name: "empty.txt", sizeBytes: 0, mimeType: "text/plain" },
      ] };
    } else {
      expect(request.operation).toBe("read");
      reads.push({ fileIndex: request.fileIndex, offset: request.offset });
      const bytes = request.fileIndex === 0 ? zip : Buffer.alloc(0);
      const end = Math.min(request.offset + AGENT_WEBCLIENT_NATIVE_SHARE_CHUNK_BYTES, bytes.length);
      result = { ok: true, dataBase64: bytes.subarray(request.offset, end).toString("base64"), eof: end === bytes.length };
    }
    queueMicrotask(() => reply(message, result));
    return true;
  });
  const files = await readDesktopNativeShareFiles(target);
  expect(files.map(file => [file.name, file.type, file.size])).toEqual([
    ["微信聊天.zip", "application/zip", zip.length], ["empty.txt", "text/plain", 0],
  ]);
  expect(await readBytes(files[0])).toEqual(new Uint8Array(zip));
  expect(reads).toEqual([{ fileIndex: 0, offset: 0 }, { fileIndex: 0, offset: AGENT_WEBCLIENT_NATIVE_SHARE_CHUNK_BYTES }, { fileIndex: 1, offset: 0 }]);
  expect(post.mock.calls.every(([message]) => message.nativeShareRequest.operation !== "complete")).toBe(true);
});

it.each([
  { dataBase64: "YQ==", eof: true },
  { dataBase64: "YWI=", eof: false },
  { dataBase64: "%%%", eof: true },
])("rejects truncated, incorrect EOF, or malformed chunks: %j", async chunk => {
  post.mockImplementation(message => {
    queueMicrotask(() => reply(message, message.nativeShareRequest.operation === "describe"
      ? { ok: true, batchId: target.batchId, files: [{ name: "chat.zip", sizeBytes: 2, mimeType: "application/zip" }] }
      : { ok: true, ...chunk }));
    return true;
  });
  await expect(readDesktopNativeShareFiles(target)).rejects.toThrow();
  expect(post).toHaveBeenCalledTimes(2);
});

it.each([
  { name: "../../private", sizeBytes: 1, mimeType: "text/plain" },
  { name: "chat.zip", sizeBytes: AGENT_WEBCLIENT_NATIVE_SHARE_MAX_BYTES + 1, mimeType: "application/zip" },
])("rejects unsafe or excessive manifest entries before reading bytes", async file => {
  post.mockImplementation(message => {
    queueMicrotask(() => reply(message, { ok: true, batchId: target.batchId, files: [file] }));
    return true;
  });
  await expect(readDesktopNativeShareFiles(target)).rejects.toThrow();
  expect(post).toHaveBeenCalledTimes(1);
});

it("ignores another frame and unrelated request IDs, then accepts only its host response", async () => {
  post.mockImplementation(message => {
    queueMicrotask(() => {
      reply(message, { ok: true, completed: true }, {} as Window);
      reply({ requestId: "unrelated" }, { ok: true, completed: true });
      reply(message, { ok: true, completed: true });
    });
    return true;
  });
  await expect(completeDesktopNativeShare(target)).resolves.toBeUndefined();
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ nativeShareRequest: { ...target, operation: "complete" } }));
});

it("cancels an in-flight read and removes the response listener", async () => {
  post.mockReturnValue(true);
  const remove = jest.spyOn(window, "removeEventListener");
  const controller = new AbortController();
  const pending = readDesktopNativeShare({ ...target, operation: "describe" }, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  expect(remove).toHaveBeenCalledWith("message", expect.any(Function));
  remove.mockRestore();
});

it("fails a missing response with a bounded timeout and permits retry", async () => {
  jest.useFakeTimers();
  post.mockReturnValue(true);
  const pending = readDesktopNativeShare({ ...target, operation: "describe" });
  const rejected = expect(pending).rejects.toThrow("timed out");
  jest.advanceTimersByTime(10_000);
  await rejected;
  post.mockImplementation(message => { queueMicrotask(() => reply(message, { ok: true, completed: true })); return true; });
  const retried = completeDesktopNativeShare(target);
  jest.runAllTicks();
  await expect(retried).resolves.toBeUndefined();
});

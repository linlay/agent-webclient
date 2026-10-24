/** @jest-environment jsdom */
import { executeAgent } from "./execute";
import { requestJson } from "../http";
import type { ExecuteRequest } from "../dto/execute";
jest.mock("../http", () => ({ requestJson: jest.fn() }));
const request: ExecuteRequest = { agentKey: "demo", message: "Extract", input: { document: { $file: "file_1" } }, outputSchema: { type: "object" } };

test("uses HTTP JSON with caller cancellation and no retry", async () => {
  const signal = new AbortController().signal;
  await executeAgent(request, [], signal);
  expect(requestJson).toHaveBeenLastCalledWith("/api/execute", {
    method: "POST", body: JSON.stringify(request), signal, jsonContentType: true, retryUnauthorized: false,
  });
});
test("sends multipart request and named files without setting JSON content type", async () => {
  const file = new File(["text"], "note.txt", { type: "text/plain" });
  await executeAgent(request, [{ field: "file_1", file }]);
  const [, options] = jest.mocked(requestJson).mock.calls.at(-1)!;
  const body = options!.body as FormData;
  expect(body.get("request")).toBe(JSON.stringify(request));
  expect(body.get("file_1")).toBe(file);
  expect(options).toMatchObject({ jsonContentType: false, retryUnauthorized: false });
});
test("propagates platform errors, including the chat ID, without retry", async () => {
  const error = Object.assign(new Error("output_invalid"), { data: { chatId: "failed-chat" } });
  jest.mocked(requestJson).mockRejectedValueOnce(error);
  const before = jest.mocked(requestJson).mock.calls.length;
  await expect(executeAgent(request)).rejects.toBe(error);
  expect(jest.mocked(requestJson).mock.calls).toHaveLength(before + 1);
});

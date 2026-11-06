/** @jest-environment jsdom */
import { recoverUserOutbox } from "./recoverUserOutbox";
import { putUserOutbox, readUserOutbox, removeUserOutbox } from "./userOutbox";
import { ApiError } from "@/shared/data/api/http";
import { getMails, getMailDetail } from "@/shared/data/api/requests/mailbox";
jest.mock("@/shared/data/api/requests/mailbox", () => ({ getMails: jest.fn(), getMailDetail: jest.fn() }));
const list = jest.mocked(getMails);
const detail = jest.mocked(getMailDetail);
const options = {scope: "recover-test", chatId: "chat-r", signal: new AbortController().signal, isCurrent: () => true};
beforeEach(() => {
  jest.clearAllMocks();
  for (const entry of readUserOutbox(options.scope)) removeUserOutbox(options.scope, entry.request.requestId);
  list.mockResolvedValue({code: 0, msg: "", data: {mails: [], total: 0}});
});
it("restores full pending user text without relying on truncated list summaries", async () => {
  list.mockResolvedValue({code: 0, msg: "", data: {mails: [{mailId: "m-r", originType: "user"}] as never, total: 1}});
  detail.mockResolvedValue({code: 0, msg: "", data: {mailId: "m-r", originType: "user", requestId: "req-r", status: "queued", toAgentKey: "agent", message: "long text".repeat(100), createdAt: 1} as never});
  await recoverUserOutbox(options);
  expect(readUserOutbox(options.scope)[0].request.message).toBe("long text".repeat(100));
});
it("marks a locally accepted message undelivered when restart cleared the ledger", async () => {
  putUserOutbox({scope: options.scope, request: {requestId: "req-missing", chatId: options.chatId, message: "retain me"}, createdAt: 1, mailId: "gone"});
  detail.mockRejectedValue(new ApiError("missing", {status: 404}));
  await recoverUserOutbox(options);
  expect(readUserOutbox(options.scope)[0]).toMatchObject({undelivered: true, request: {message: "retain me"}});
});
it("ignores late responses after a Chat or identity switch", async () => {
  detail.mockResolvedValue({code: 0, msg: "", data: {mailId: "late", originType: "user", requestId: "late-r", status: "queued", message: "late"} as never});
  await recoverUserOutbox({...options, mailId: "late", isCurrent: () => false});
  expect(readUserOutbox(options.scope)).toEqual([]);
});

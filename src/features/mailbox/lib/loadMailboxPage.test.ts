import { getMails } from "@/shared/data/api/requests/mailbox";
import type { MailRecord } from "@/shared/data/api/dto/mailbox";
import { loadMailboxPage } from "./loadMailboxPage";

jest.mock("@/shared/data/api/requests/mailbox", () => ({ getMails: jest.fn() }));
const list = jest.mocked(getMails);
const mail = (mailId: string, createdAt: number) => ({ mailId, createdAt }) as MailRecord;
beforeEach(() => list.mockReset());

it("merges pending and received by newest time before slicing a page", async () => {
  const source = { pending: [mail("p5", 5), mail("p2", 2)], received: [mail("r6", 6), mail("r4", 4), mail("r3", 3)] };
  list.mockImplementation(async params => {
    const rows = source[params.box as keyof typeof source];
    return { code: 0, msg: "", data: { mails: rows.slice(params.offset, params.offset! + params.limit!), total: rows.length } };
  });
  const signal = new AbortController().signal;
  const filters = { agentKey: "recipient", kind: "letter" as const };
  expect(await loadMailboxPage("inbox", filters, 0, 2, signal)).toEqual({ mails: [source.received[0], source.pending[0]], total: 5 });
  expect(await loadMailboxPage("inbox", filters, 2, 2, signal)).toEqual({ mails: [source.received[1], source.received[2]], total: 5 });
  expect(await loadMailboxPage("inbox", filters, 4, 2, signal)).toEqual({ mails: [source.pending[1]], total: 5 });
  expect(list).toHaveBeenCalledWith(expect.objectContaining(filters), signal);
});

it("uses a stable descending mail ID for equal timestamps and deduplicates transitions", async () => {
  list.mockImplementation(async params => ({ code: 0, msg: "", data: {
    mails: params.box === "pending" ? [mail("b", 1)] : [mail("b", 1), mail("a", 1)], total: 2,
  } }));
  expect((await loadMailboxPage("inbox", {}, 0, 3)).mails.map(value => value.mailId)).toEqual(["b", "a"]);
});

it("reads only trash and retains the status filter", async () => {
  list.mockResolvedValue({ code: 0, msg: "", data: { mails: [mail("failed", 3)], total: 1 } });
  const result = await loadMailboxPage("trash", { status: "failed" }, 0, 50);
  expect(result.mails.map(value => value.mailId)).toEqual(["failed"]);
  expect(list).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledWith({ box: "trash", status: "failed", offset: 0, limit: 50 }, undefined);
});

it("loads deep pages in bounded requests without losing merged ordering", async () => {
  const source = Array.from({ length: 300 }, (_, index) => mail(`m${index}`, 300 - index));
  list.mockImplementation(async params => {
    const rows = params.box === "pending" ? source : [];
    return { code: 0, msg: "", data: { mails: rows.slice(params.offset, params.offset! + params.limit!), total: rows.length } };
  });
  expect((await loadMailboxPage("inbox", {}, 250, 50)).mails).toEqual(source.slice(250));
  expect(list).toHaveBeenCalledWith({ box: "pending", offset: 200, limit: 100 }, undefined);
});

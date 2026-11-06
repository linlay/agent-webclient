import type { MailBox, MailListParams, MailRecord } from "@/shared/data/api/dto/mailbox";
import { getMails } from "@/shared/data/api/requests/mailbox";

export type MailboxFolder = "inbox" | "trash";

// The wire protocol keeps three boxes. Merge their newest prefixes before
// slicing so pending mail cannot displace newer received mail on later pages.
export async function loadMailboxPage(
  folder: MailboxFolder,
  filters: Pick<MailListParams, "agentKey" | "kind" | "status">,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<{ mails: MailRecord[]; total: number }> {
  const boxes: MailBox[] = folder === "inbox" ? ["pending", "received"] : ["trash"];
  const results = await Promise.all(boxes.map(async box => {
    const mails: MailRecord[] = [];
    let total = 0;
    do {
      const response = await getMails({ ...filters, box, offset: mails.length, limit: Math.min(200, offset + limit - mails.length) }, signal);
      total = response.data.total;
      if (!response.data.mails.length) break;
      mails.push(...response.data.mails);
    } while (mails.length < Math.min(total, offset + limit));
    return { mails, total };
  }));
  const unique = new Map(results.flatMap(result => result.mails).map(mail => [mail.mailId, mail]));
  const mails = [...unique.values()].sort((a, b) => b.createdAt - a.createdAt || b.mailId.localeCompare(a.mailId));
  return { mails: mails.slice(offset, offset + limit), total: results.reduce((sum, result) => sum + result.total, 0) };
}

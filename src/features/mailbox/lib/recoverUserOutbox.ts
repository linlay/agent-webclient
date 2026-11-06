import { ApiError } from "@/shared/data/api/http";
import { getMails, getMailDetail } from "@/shared/data/api/requests/mailbox";
import { consumeUserOutbox, isUndeliveredMailStatus, putUserOutbox, readUserOutbox, updateUserOutbox } from "./userOutbox";

interface RecoveryOptions {
  scope: string;
  chatId: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  mailId?: string;
  unresolvedRequestIds?: string[];
}

export async function recoverUserOutbox(options: RecoveryOptions): Promise<void> {
  const { scope, chatId, signal, isCurrent, mailId } = options;
  const local = readUserOutbox(scope).filter(entry => entry.request.chatId === chatId);
  const ids = new Set<string>();
  if (mailId) {
    ids.add(mailId);
  } else {
    let offset = 0;
    while (!signal.aborted && isCurrent()) {
      const { data } = await getMails({ box: "pending", chatId, limit: 200, offset }, signal);
      for (const mail of data.mails) {
        if (mail.originType === "user") ids.add(mail.mailId);
      }
      offset += data.mails.length;
      if (offset >= data.total || !data.mails.length) break;
    }
    for (const entry of local) {
      if (entry.mailId) ids.add(entry.mailId);
    }
  }
  await Promise.all([...ids].map(async id => {
    try {
      const { data: mail } = await getMailDetail(id, signal);
      if (signal.aborted || !isCurrent() || mail.originType !== "user" || !mail.requestId) return;
      if (["delivered", "done"].includes(mail.status)) {
        consumeUserOutbox(scope, mail.requestId);
        return;
      }
      const existing = readUserOutbox(scope).find(entry => entry.request.requestId === mail.requestId);
      putUserOutbox({
        scope,
        request: existing?.request || {
          requestId: mail.requestId,
          chatId,
          agentKey: mail.toAgentKey,
          message: mail.message,
        },
        createdAt: existing?.createdAt || mail.createdAt,
        mailId: id,
        delivery: mail.delivery,
        ignoredOptions: mail.ignoredOptions,
        uncertain: false,
        undelivered: isUndeliveredMailStatus(mail.status),
        error: mail.error?.message,
      });
    } catch (error) {
      if (!signal.aborted && isCurrent() && error instanceof ApiError && error.status === 404) {
        const entry = readUserOutbox(scope).find(value => value.mailId === id);
        if (entry) updateUserOutbox(scope, entry.request.requestId, { undelivered: true });
      }
    }
  }));
  if (signal.aborted || !isCurrent()) return;
  for (const id of options.unresolvedRequestIds || []) {
    const entry = readUserOutbox(scope).find(value => value.request.requestId === id);
    if (entry && !entry.mailId && !entry.undelivered) updateUserOutbox(scope, id, { uncertain: true });
  }
}

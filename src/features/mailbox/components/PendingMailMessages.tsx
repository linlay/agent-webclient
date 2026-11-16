import React, { useEffect, useRef, useState } from "react";
import { Alert, Button } from "antd";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { getBackendMode } from "@/shared/config/backendMode";
import { resolveStorageIdentity } from "@/shared/data/auth/storageIdentity";
import { createRequestId } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { recoverUserOutbox } from "../lib/recoverUserOutbox";
import {
  consumeUserOutbox,
  readUserOutbox,
  removeUserOutbox,
  userOutboxChanged,
} from "../lib/userOutbox";
import type { UserOutboxEntry } from "../lib/userOutbox";
import styles from "./PendingMailMessages.module.css";
import { UiButton } from "@/shared/ui/UiButton";

interface MailUpdate {
  toChatId?: string;
  mailId?: string;
  requestId?: string;
  ignoredOptions?: string[];
}

export function PendingMailMessages() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const scope = resolveStorageIdentity(state.accessToken);
  const chatId = state.chatId;
  const gateway = getBackendMode() === "gateway";
  const connected = state.wsStatus === "connected";
  const [entries, setEntries] = useState<UserOutboxEntry[]>(() => readUserOutbox(scope));
  const [clipped, setClipped] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setEntries(readUserOutbox(scope));
    update();
    window.addEventListener(userOutboxChanged, update);
    return () => window.removeEventListener(userOutboxChanged, update);
  }, [scope]);

  // The tray is height-capped: keep the newest failure in view and fade the top
  // edge only while older entries are actually cut off.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sync = () => {
      list.scrollTop = list.scrollHeight;
      setClipped(list.scrollHeight - list.clientHeight > 1);
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(list);
    return () => observer.disconnect();
  }, [entries, chatId]);

  useEffect(() => {
    if (!chatId || gateway) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sequence = 0;
    const changedIds = new Set<string>();
    const initialUnaccepted = readUserOutbox(scope)
      .filter(entry => entry.request.chatId === chatId && !entry.mailId)
      .map(entry => entry.request.requestId);
    const recover = (mailId?: string) => {
      const current = ++sequence;
      void recoverUserOutbox({
        scope,
        chatId,
        signal: controller.signal,
        isCurrent: () => current === sequence,
        mailId,
        unresolvedRequestIds: initialUnaccepted,
      }).catch(() => { /* Preserve drafts while disconnected. */ });
    };
    const update = (event: Event) => {
      const detail = (event as CustomEvent<MailUpdate>).detail;
      if (detail?.toChatId && detail.toChatId !== chatId) return;
      if (detail?.requestId && detail.ignoredOptions?.length) {
        const id = `ignored_${detail.requestId}`;
        dispatch({
          type: "SET_TIMELINE_NODE",
          id,
          node: {
            id, kind: "message", role: "system", ts: Date.now(),
            text: t("mailbox.outbox.ignored", { options: detail.ignoredOptions.join(", ") }),
          },
        });
        dispatch({ type: "APPEND_TIMELINE_ORDER", id });
      }
      if (detail?.mailId) changedIds.add(detail.mailId);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const ids = [...changedIds];
        changedIds.clear();
        recover(ids.length === 1 ? ids[0] : undefined);
      }, 150);
    };
    recover();
    window.addEventListener("agent:mail-updated", update);
    window.addEventListener("agent:mail-receipt", update);
    window.addEventListener("online", update);
    return () => {
      ++sequence;
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("agent:mail-updated", update);
      window.removeEventListener("agent:mail-receipt", update);
      window.removeEventListener("online", update);
    };
  }, [chatId, scope, gateway, connected, dispatch, t]);

  useEffect(() => {
    for (const entry of readUserOutbox(scope)) {
      if (entry.request.chatId === chatId && state.timelineNodes.has(`user_${entry.request.requestId}`)) {
        consumeUserOutbox(scope, entry.request.requestId);
      }
    }
  }, [scope, chatId, state.timelineNodes]);

  const worker = state.workerIndexByKey.get(state.workerSelectionKey);
  const selectedAgentKey = state.pendingNewChatAgentKey || (worker?.type === "agent" ? worker.sourceId : "");
  // Normal delivery is internal bookkeeping. The confirmed request event owns
  // the chat message; showing an outbox copy here makes it flash before query.
  const visible = entries.filter(entry => (entry.undelivered || entry.uncertain) && (chatId
    ? entry.request.chatId === chatId
    : (!entry.request.chatId || entry.newChat) && entry.request.agentKey === selectedAgentKey));
  if (gateway || !visible.length) return null;
  const resend = (entry: UserOutboxEntry) => {
    const request = entry.request;
    window.dispatchEvent(new CustomEvent("agent:send-message", {
      detail: {
        ...request,
        primary: request.chatId ? undefined : request.primary,
        submissionRequestId: createRequestId("req"),
        model: request.model,
      },
    }));
    removeUserOutbox(scope, request.requestId);
  };
  return (
    <div className={styles.messages} ref={listRef} data-clipped={clipped ? "true" : undefined}>
      {visible.map(entry => {
        const status = entry.undelivered ? "undelivered" : "uncertain";
        const body = entry.request.message
          || t("mailbox.outbox.referencesOnly", { count: entry.request.references?.length ?? 0 });
        return (
          <Alert
            key={entry.request.requestId}
            className={styles.alert}
            type={entry.undelivered ? "error" : "warning"}
            showIcon
            message={t(`mailbox.outbox.${status}`)}
            description={(
              <div className={styles.content}>
                <div className={styles.body}>{body}</div>
                {entry.error ? <div className={styles.error}>{entry.error}</div> : null}
                {entry.ignoredOptions?.length ? (
                  <div className={styles.notice}>
                    {t("mailbox.outbox.ignored", { options: entry.ignoredOptions.join(", ") })}
                  </div>
                ) : null}
              </div>
            )}
            action={entry.undelivered ? (
              <div className={styles.actions}>
                <UiButton size="mini" variant="ghost" onClick={() => resend(entry)}>
                  {t("mailbox.outbox.retry")}
                </UiButton>
                <UiButton size="mini" variant="ghost" color="danger" onClick={() => removeUserOutbox(scope, entry.request.requestId)}>
                  {t("mailbox.outbox.remove")}
                </UiButton>
              </div>
            ) : null}
          />
        );
      })}
    </div>
  );
}

import { useAppState } from "@/app/state/AppContext";
import { resolveStorageIdentity } from "@/shared/data/auth/storageIdentity";
import React, { useEffect, useState } from "react";
import { Badge } from "antd";
import { getMails } from "@/shared/data/api/requests/mailbox";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";

export function MailboxEntry({onOpen}: {onOpen: () => void}) {
  const { t } = useI18n();
  const { accessToken } = useAppState();
  const scope = resolveStorageIdentity(accessToken);
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    const controller = new AbortController();
    let sequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const response = await getMails({box: "pending", limit: 1}, controller.signal);
        if (current === sequence && !controller.signal.aborted) setCount(response.data.total);
      } catch { /* Keep the last known badge while temporarily disconnected. */ }
    };
    const update = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {void refresh();}, 100);
    };
    void refresh();
    window.addEventListener("agent:mail-updated", update);
    return () => {
      ++sequence;
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("agent:mail-updated", update);
    };
  }, [scope]);
  return <Badge count={count}>
    <UiButton size="sm" variant="ghost" onClick={onOpen}>{t("mailbox.title")}</UiButton>
  </Badge>;
}

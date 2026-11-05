import { useCallback, useEffect, useState } from "react";
import { getMailDetail } from "@/shared/data/api/requests/mailbox";
import type { MailRecord } from "@/shared/data/api/dto/mailbox";
import { readMailUpdate } from "../lib/mailUpdates";

export function useMailDetail(mailId: string) {
  const [mail, setMail] = useState<MailRecord>();
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await getMailDetail(mailId);
    setMail(response.data);
  }, [mailId]);

  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    const load = async () => {
      const current = ++sequence;
      try {
        const response = await getMailDetail(mailId, controller.signal);
        if (current === sequence && !controller.signal.aborted) {
          setMail(response.data);
          setError("");
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(String(cause));
      }
    };
    const update = (event: Event) => {
      if (readMailUpdate(event)?.mailId === mailId) void load();
    };
    void load();
    window.addEventListener("agent:mail-updated", update);
    return () => {
      ++sequence;
      controller.abort();
      window.removeEventListener("agent:mail-updated", update);
    };
  }, [mailId]);
  return {mail, error, refresh};
}

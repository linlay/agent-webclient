import React, { useEffect, useRef, useState } from "react";
import type { ViewReference } from "@/shared/contracts/view";
import { getView } from "@/shared/data";
import { viewDocumentHTML } from "@/shared/utils/viewDocument";
import { safeJsonParse } from "@/shared/utils/safeJsonParse";
import { useI18n } from "@/shared/i18n";

// Display views have no submit/action listener. Only HITL's host may submit.
export function ViewEmbed({ chatId, view, payloadRaw, viewError }: { chatId: string; view: ViewReference; payloadRaw: string; viewError?: string }) {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const [resolvedView, setResolvedView] = useState(view);
  const [html, setHTML] = useState("");
  const [error, setError] = useState("");
  const identity = JSON.stringify([chatId, view.connectorId, view.key, view.hash, viewError]);
  useEffect(() => {
    let active = true;
    ready.current = false;
    setHTML(""); setError("");
    if (viewError && !view.hash) { setError(viewError); return; }
    if (!chatId) return;
    getView({ chatId, connectorId: view.connectorId, key: view.key, hash: view.hash, usage: "display" })
      .then(response => { if (active) { setResolvedView(response.data.view); setHTML(viewDocumentHTML(response.data, "display")); } })
      .catch(error => { if (active) setError(String(error.message)); });
    return () => { active = false; ready.current = false; };
  }, [identity]);
  const post = (type: "view_init" | "view_update") => frame.current?.contentWindow?.postMessage({
    type, data: { view: resolvedView, payload: safeJsonParse(payloadRaw, payloadRaw) },
  }, "*");
  useEffect(() => { if (ready.current) post("view_update"); }, [payloadRaw]);
  return <div className="tw:my-2">
    {error && <div role="alert">{t("viewport.loadFailed", { detail: error })}</div>}
    {!error && !html && <div role="status">{t("viewport.loading")}</div>}
    {html && <iframe ref={frame} title={`view-${view.connectorId}-${view.key}`} srcDoc={html}
      sandbox="allow-scripts" className="tw:h-[320px] tw:w-full tw:border-0"
      onLoad={() => { ready.current = true; post("view_init"); }} />}
  </div>;
}

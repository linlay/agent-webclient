import { useEffect, useState } from "react";
import { getView } from "@/shared/data";
import { viewDocumentHTML } from "@/shared/utils/viewDocument";
import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";

export function useAwaitingFrameDocument(data: FormActiveAwaiting, chatId: string) {
  const key = JSON.stringify([data.key, chatId, data.view, data.viewKey, data.viewError]);
  const [state, setState] = useState({ key: "", html: "", loading: true, error: "" });
  useEffect(() => {
    let active = true;
    setState({ key, html: "", loading: true, error: "" });
    const load = async () => {
      if (data.viewError && data.view && !data.view.hash) throw new Error(data.viewError);
      if (data.view) {
        const response = await getView({ source: data.view.source, runId:data.runId, chatId, connectorId: data.view.connectorId, key: data.view.key, hash: data.view.hash, usage: "form" });
        return viewDocumentHTML(response.data, "form");
      }
      if (data.viewHtml) return data.viewHtml;
      throw new Error("Missing view reference");
    };
    void load().then(html => { if (active) setState({ key, html, loading: false, error: "" }); })
      .catch(error => { if (active) setState({ key, html: "", loading: false, error: String(error.message) }); });
    return () => { active = false; };
  }, [key]);
  return state.key === key ? state : { key, html: "", loading: true, error: "" };
}

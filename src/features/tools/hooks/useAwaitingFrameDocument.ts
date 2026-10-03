import { useEffect, useState } from "react";
import { getView, getViewport } from "@/shared/data";
import { viewDocumentHTML } from "@/shared/utils/viewDocument";
import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";

export function useAwaitingFrameDocument(data: FormActiveAwaiting, chatId: string) {
  const key = JSON.stringify([data.key, chatId, data.view, data.viewportKey, data.viewError]);
  const [state, setState] = useState({ key: "", html: "", loading: true, error: "" });
  useEffect(() => {
    let active = true;
    setState({ key, html: "", loading: true, error: "" });
    const load = async () => {
      if (data.viewError && data.view && !data.view.hash) throw new Error(data.viewError);
      if (data.view) {
        const response = await getView({ chatId, connectorId: data.view.connectorId, key: data.view.key, hash: data.view.hash, usage: "form" });
        return viewDocumentHTML(response.data, "form");
      }
      if (data.viewportHtml) return data.viewportHtml;
      const response = await getViewport(data.viewportKey);
      const html = (response.data as { html?: string })?.html;
      if (!html?.trim()) throw new Error("Viewport response does not contain html");
      return html;
    };
    void load().then(html => { if (active) setState({ key, html, loading: false, error: "" }); })
      .catch(error => { if (active) setState({ key, html: "", loading: false, error: String(error.message) }); });
    return () => { active = false; };
  }, [key]);
  return state.key === key ? state : { key, html: "", loading: true, error: "" };
}

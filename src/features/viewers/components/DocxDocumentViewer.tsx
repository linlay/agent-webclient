import React from "react";
import { getResourceBlob } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { DOCX_MAX_BYTES, validateDocxArchive } from "@/features/viewers/lib/docxPreview";
import { createDocxFrameHtml } from "@/features/viewers/lib/docxPreviewFrame";
import { docxPreviewAssets } from "@/features/viewers/lib/docxPreviewAssets";
import styles from "./DocxDocumentViewer.module.css";

interface Props {
  url: string;
  name: string;
  chatId: string;
  teamChat?: boolean;
  sizeBytes?: number;
  onDownload: () => Promise<void>;
}

export const DocxDocumentViewer: React.FC<Props> = ({ url, name, chatId, teamChat, sizeBytes, onDownload }) => {
  const { t } = useI18n();
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [errorKind, setErrorKind] = React.useState("failed");
  const [frameReady, setFrameReady] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageCount, setPageCount] = React.useState(0);
  const [zoom, setZoom] = React.useState("fit");
  const [downloadBusy, setDownloadBusy] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState(false);
  const token = React.useMemo(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join(""), [url, chatId, attempt]);
  const frameHtml = React.useMemo(() => createDocxFrameHtml(token, docxPreviewAssets), [token]);
  const post = React.useCallback((command: Record<string, unknown>, transfer: Transferable[] = []) => {
    frameRef.current?.contentWindow?.postMessage({ type: "docx-command", token, ...command }, "*", transfer);
  }, [token]);

  React.useEffect(() => {
    setStatus("loading"); setPage(1); setPageCount(0);
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== "docx-preview" || event.data?.token !== token) return;
      const result = event.data;
      if (result.state === "ready") setFrameReady(token);
      if (result.state === "rendered" && Number.isInteger(result.pages) && result.pages > 0 && result.pages <= 10000) {
        setPageCount(result.pages); setStatus("ready");
      }
      if (result.state === "page" && Number.isInteger(result.page) && result.page > 0 && result.page <= 10000) setPage(result.page);
      if (result.state === "error") { setErrorKind("failed"); setStatus("error"); }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [token]);

  React.useEffect(() => {
    if (status !== "loading") return;
    const timeout = window.setTimeout(() => { setErrorKind("failed"); setStatus("error"); }, 45000);
    return () => window.clearTimeout(timeout);
  }, [status, token]);

  React.useEffect(() => {
    if (frameReady !== token || !url) return;
    const controller = new AbortController();
    void (async () => {
      if (sizeBytes !== undefined && sizeBytes > DOCX_MAX_BYTES) throw new Error("docx_too_large");
      const blob = await getResourceBlob(url, { chatId, teamChat, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (blob.size > DOCX_MAX_BYTES) throw new Error("docx_too_large");
      const data = await blob.arrayBuffer();
      validateDocxArchive(data);
      if (!controller.signal.aborted) post({ action: "render", data }, [data]);
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const code = (error as { status?: number } | null)?.status;
      setErrorKind(code === 404 ? "missing" : code === 401 || code === 403 ? "forbidden"
        : error instanceof Error && error.message === "docx_too_large" ? "tooLarge" : "failed");
      setStatus("error");
    });
    return () => controller.abort();
  }, [url, chatId, teamChat, frameReady, token, post]);

  React.useEffect(() => {
    if (status === "ready") post({ action: "zoom", value: zoom });
  }, [status, zoom, post]);

  const goToPage = (next: number) => {
    if (next >= 1 && next <= pageCount) post({ action: "page", page: next });
  };
  const download = async () => {
    setDownloadBusy(true);
    setDownloadError(false);
    try { await onDownload(); } catch { setDownloadError(true); }
    finally { setDownloadBusy(false); }
  };

  return <div className={styles.viewer} aria-busy={status === "loading"}>
    <div className={styles.toolbar}>
      <span>{t("contentViewer.docx.readOnly")}</span>
      <button disabled={status !== "ready" || page <= 1} onClick={() => goToPage(page - 1)}>{t("contentViewer.pdf.previous")}</button>
      <span aria-live="polite">{pageCount ? `${page} / ${pageCount}` : "– / –"}</span>
      <button disabled={status !== "ready" || page >= pageCount} onClick={() => goToPage(page + 1)}>{t("contentViewer.pdf.next")}</button>
      <select aria-label={t("contentViewer.docx.zoom")} value={zoom} onChange={(event) => setZoom(event.target.value)}>
        <option value="fit">{t("contentViewer.docx.fit")}</option>
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((scale) => <option key={scale} value={scale}>{Math.round(scale * 100)}%</option>)}
      </select>
      <details className={styles.more}><summary aria-label={t("contentViewer.docx.more")}>•••</summary>
        <button disabled={downloadBusy} onClick={() => void download()}>{t("contentViewer.docx.downloadOriginal")}</button>
      </details>
    </div>
    {status === "loading" ? <p role="status" className={styles.status}>{t("contentViewer.docx.loading")}</p> : null}
    {status === "error" ? <div role="alert" className={styles.status}>
      <p>{t(`contentViewer.docx.${errorKind}`)}</p>
      <button onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>{t("contentViewer.docx.retry")}</button>
      <button disabled={downloadBusy} onClick={() => void download()}>{t("contentViewer.docx.downloadOriginal")}</button>
    </div> : null}
    {downloadError ? <p role="alert">{t("contentViewer.error.download")}</p> : null}
    <iframe key={token} ref={frameRef} title={name} className={styles.frame}
      style={{ visibility: status === "ready" ? "visible" : "hidden" }} sandbox="allow-scripts" srcDoc={frameHtml}
      onLoad={() => post({ action: "ping" })} />
  </div>;
};

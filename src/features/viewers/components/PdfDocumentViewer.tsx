import React from "react";
import { Button, Input, InputNumber, Space } from "antd";
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { t } from "@/shared/i18n";

GlobalWorkerOptions.workerSrc = new URL(
  // Desktop's Electron runtime also needs the worker's compatibility polyfills.
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export const PdfDocumentViewer: React.FC<{
  url: string;
  title: string;
}> = ({ url, title }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [documentProxy, setDocumentProxy] = React.useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [scale, setScale] = React.useState(1.25);
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const loadingTask = getDocument({ url });
    let disposed = false;
    setDocumentProxy(null);
    setPageNumber(1);
    setError("");
    setStatus(t("contentViewer.pdf.loading"));
    void loadingTask.promise.then((pdf) => {
      if (disposed) {
        void pdf.destroy();
        return;
      }
      setDocumentProxy(pdf);
      setStatus("");
    }).catch(() => {
      if (!disposed) {
        setStatus("");
        setError(t("contentViewer.pdf.failed"));
      }
    });
    return () => {
      disposed = true;
      void loadingTask.destroy();
    };
  }, [url]);

  React.useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
    let disposed = false;
    let renderTask: RenderTask | null = null;
    void documentProxy.getPage(pageNumber).then((page) => {
      if (disposed || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const outputScale = Math.max(1, globalThis.devicePixelRatio || 1);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      return renderTask.promise;
    }).catch((reason: unknown) => {
      if (!disposed && String(reason).toLowerCase().includes("cancel") === false) {
        setError(t("contentViewer.pdf.failed"));
      }
    });
    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, scale]);

  const search = async () => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!documentProxy || !normalized || searching) return;
    setSearching(true);
    setStatus("");
    try {
      for (let offset = 0; offset < documentProxy.numPages; offset += 1) {
        const candidate = ((pageNumber + offset) % documentProxy.numPages) + 1;
        const page = await documentProxy.getPage(candidate);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => "str" in item ? item.str : "")
          .join(" ")
          .toLocaleLowerCase();
        if (text.includes(normalized)) {
          setPageNumber(candidate);
          setStatus(t("contentViewer.pdf.found", { page: candidate }));
          return;
        }
      }
      setStatus(t("contentViewer.pdf.notFound"));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="tw:flex tw:min-h-[480px] tw:flex-1 tw:flex-col tw:overflow-hidden" aria-label={title}>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-line-soft tw:px-2 tw:py-1.5">
        <Space size={6}>
          <Button size="small" disabled={!documentProxy || pageNumber <= 1} onClick={() => setPageNumber((page) => page - 1)}>
            {t("contentViewer.pdf.previous")}
          </Button>
          <InputNumber
            size="small"
            min={1}
            max={documentProxy?.numPages || 1}
            value={pageNumber}
            onChange={(value) => setPageNumber(Math.max(1, Math.min(documentProxy?.numPages || 1, Number(value) || 1)))}
          />
          <span>/ {documentProxy?.numPages || "–"}</span>
          <Button size="small" disabled={!documentProxy || pageNumber >= documentProxy.numPages} onClick={() => setPageNumber((page) => page + 1)}>
            {t("contentViewer.pdf.next")}
          </Button>
          <Button size="small" onClick={() => setScale((value) => Math.max(0.5, value - 0.25))}>−</Button>
          <span>{Math.round(scale * 100)}%</span>
          <Button size="small" onClick={() => setScale((value) => Math.min(3, value + 0.25))}>+</Button>
        </Space>
        <Space.Compact>
          <Input
            size="small"
            allowClear
            value={query}
            placeholder={t("contentViewer.pdf.search")}
            onChange={(event) => setQuery(event.target.value)}
            onPressEnter={() => void search()}
          />
          <Button size="small" loading={searching} onClick={() => void search()}>{t("contentViewer.pdf.searchAction")}</Button>
        </Space.Compact>
      </div>
      {error ? <div role="alert" className="status-line tw:m-2.5">{error}</div> : null}
      {status ? <div aria-live="polite" className="tw:px-3 tw:py-1 tw:text-xs tw:text-ink-muted">{status}</div> : null}
      <div className="tw:min-h-0 tw:flex-1 tw:overflow-auto tw:bg-[color-mix(in_srgb,var(--bg-input)_70%,#808080)] tw:p-4">
        <canvas ref={canvasRef} className="tw:mx-auto tw:block tw:bg-white tw:shadow-lg" />
      </div>
    </div>
  );
};

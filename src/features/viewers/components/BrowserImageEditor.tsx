import React from "react";
import { Button, Input, Space } from "antd";
import {
  commitDocument,
  type DocumentCommitSource,
} from "@/shared/data";
import {
  hasDesktopHostBridge,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";
import { t } from "@/shared/i18n";
import { useAppMessage } from "@/shared/ui/useAppMessage";

type RegionAnnotation = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  note: string;
};

type RegionDraft = Omit<RegionAnnotation, "id" | "note">;

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas export failed")), mimeType, 0.92);
  });
}

function blobBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error || new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}

export const BrowserImageEditor: React.FC<{
  url: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  source: DocumentCommitSource;
  revision: string;
  onRevisionChange: (revision: string) => void;
  onStateChange: (state: { dirty: boolean; busy: boolean; annotationCount: number }) => void;
}> = ({ url, name, mimeType, source, revision, onRevisionChange, onStateChange }) => {
  const message = useAppMessage();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [annotations, setAnnotations] = React.useState<RegionAnnotation[]>([]);
  const [regionDraft, setRegionDraft] = React.useState<RegionDraft | null>(null);
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const drawOriginal = React.useCallback(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    setDirty(false);
    setAnnotations([]);
    setRegionDraft(null);
  }, []);

  React.useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageRef.current = image;
      drawOriginal();
    };
    image.onerror = () => message.error(t("contentViewer.error.image"));
    image.src = url;
    return () => { imageRef.current = null; };
  }, [drawOriginal, message, url]);

  React.useEffect(() => {
    onStateChange({ dirty, busy, annotationCount: annotations.length });
  }, [annotations.length, busy, dirty, onStateChange]);

  const rotate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width = copy.height;
    canvas.height = copy.width;
    const context = canvas.getContext("2d");
    context?.translate(canvas.width, 0);
    context?.rotate(Math.PI / 2);
    context?.drawImage(copy, 0, 0);
    setDirty(true);
    setAnnotations([]);
  };

  const flip = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    const context = canvas.getContext("2d");
    context?.translate(canvas.width, 0);
    context?.scale(-1, 1);
    context?.drawImage(copy, 0, 0);
    setDirty(true);
    setAnnotations([]);
  };

  const save = async (mode: "overwrite" | "new-artifact") => {
    const canvas = canvasRef.current;
    if (!canvas || !dirty || busy) return;
    setBusy(true);
    try {
      const blob = await canvasBlob(canvas, mimeType);
      const response = await commitDocument({
        operation: "document.commit",
        source,
        mode,
        expectedRevision: revision,
        payload: {
          kind: "document-image",
          mimeType,
          dataBase64: await blobBase64(blob),
        },
      });
      if (mode === "overwrite") onRevisionChange(response.data.revision);
      setDirty(false);
      message.success(t("contentViewer.save.success"));
    } catch (error: unknown) {
      const status = typeof error === "object" && error && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 0;
      message.error(status === 409 ? t("contentViewer.save.conflict") : t("contentViewer.error.image"));
    } finally {
      setBusy(false);
    }
  };

  const handoff = () => {
    const ready = annotations.filter((annotation) => annotation.note.trim());
    if (!ready.length) return;
    const canvas = canvasRef.current;
    const text = [
      `${t("contentViewer.annotation.request")} ${name} (revision: ${revision})`,
      "",
      ...ready.map((annotation, index) =>
        `${index + 1}. (${Math.round(annotation.x)}, ${Math.round(annotation.y)}, ` +
        `${Math.round(annotation.width)}×${Math.round(annotation.height)}) / ` +
        `${canvas?.width || 0}×${canvas?.height || 0}: ${annotation.note.trim()}`),
    ].join("\n");
    if (hasDesktopHostBridge()) {
      postDesktopHostMessage({
        type: "desktop:agent-webclient:document-handoff",
        requestId: `image_handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text,
      });
    } else {
      window.dispatchEvent(new CustomEvent("agent:set-composer-draft", { detail: { draft: text } }));
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
    }
    setAnnotations([]);
  };

  return (
    <div className="tw:flex tw:min-h-[420px] tw:flex-1 tw:flex-col tw:overflow-hidden">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-line-soft tw:px-2 tw:py-1.5">
        <Space size={6}>
          <Button size="small" onClick={rotate}>{t("contentViewer.image.rotate")}</Button>
          <Button size="small" onClick={flip}>{t("contentViewer.image.flip")}</Button>
          <Button size="small" disabled={!dirty} onClick={drawOriginal}>{t("contentViewer.image.reset")}</Button>
        </Space>
        <Space size={6}>
          {source.kind === "artifact" ? (
            <Button size="small" disabled={!dirty || busy} onClick={() => void save("overwrite")}>
              {t("contentViewer.action.overwrite")}
            </Button>
          ) : null}
          <Button
            size="small"
            type="primary"
            loading={busy}
            disabled={!dirty || busy}
            onClick={() => void save(source.kind === "workspace-file" ? "overwrite" : "new-artifact")}
          >
            {source.kind === "workspace-file" ? t("contentViewer.action.save") : t("contentViewer.action.saveNewArtifact")}
          </Button>
        </Space>
      </div>
      <div className="tw:min-h-0 tw:flex-1 tw:overflow-auto tw:bg-[color-mix(in_srgb,var(--bg-input)_80%,#777)] tw:p-4">
        <div className="tw:relative tw:mx-auto tw:w-fit tw:max-w-full tw:shadow">
          <canvas
            ref={canvasRef}
            className="tw:block tw:max-w-full tw:touch-none tw:bg-white"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const start = {
                x: (event.clientX - rect.left) * canvas.width / rect.width,
                y: (event.clientY - rect.top) * canvas.height / rect.height,
              };
              dragStartRef.current = start;
              setRegionDraft({ ...start, width: 0, height: 0 });
            }}
            onPointerMove={(event) => {
              const canvas = canvasRef.current;
              const start = dragStartRef.current;
              if (!canvas || !start) return;
              const rect = canvas.getBoundingClientRect();
              const current = {
                x: (event.clientX - rect.left) * canvas.width / rect.width,
                y: (event.clientY - rect.top) * canvas.height / rect.height,
              };
              setRegionDraft({
                x: Math.min(start.x, current.x),
                y: Math.min(start.y, current.y),
                width: Math.abs(current.x - start.x),
                height: Math.abs(current.y - start.y),
              });
            }}
            onPointerUp={() => {
              dragStartRef.current = null;
              setRegionDraft((draft) => {
                if (draft && draft.width >= 2 && draft.height >= 2) {
                  setAnnotations((current) => [...current, {
                    id: globalThis.crypto.randomUUID(),
                    ...draft,
                    note: "",
                  }]);
                }
                return null;
              });
            }}
            onPointerCancel={() => {
              dragStartRef.current = null;
              setRegionDraft(null);
            }}
          />
          <svg
            aria-hidden="true"
            className="tw:pointer-events-none tw:absolute tw:inset-0 tw:h-full tw:w-full"
            viewBox={`0 0 ${canvasRef.current?.width || 1} ${canvasRef.current?.height || 1}`}
            preserveAspectRatio="none"
          >
            {[...annotations, ...(regionDraft ? [{ id: "draft", ...regionDraft, note: "" }] : [])].map((annotation) => (
              <rect
                key={annotation.id}
                x={annotation.x}
                y={annotation.y}
                width={annotation.width}
                height={annotation.height}
                fill="rgba(22, 119, 255, 0.12)"
                stroke="#1677ff"
                strokeWidth={Math.max(1, (canvasRef.current?.width || 1) / 600)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
      </div>
      {annotations.length ? (
        <div className="tw:max-h-44 tw:overflow-auto tw:border-t tw:border-line-soft tw:p-2">
          {annotations.map((annotation, index) => (
            <div key={annotation.id} className="tw:mb-2 tw:flex tw:items-center tw:gap-2">
              <code>
                ({Math.round(annotation.x)}, {Math.round(annotation.y)}, {Math.round(annotation.width)}×{Math.round(annotation.height)})
              </code>
              <Input
                value={annotation.note}
                placeholder={`${index + 1}. ${t("contentViewer.image.annotationPlaceholder")}`}
                onChange={(event) => setAnnotations((current) => current.map((item) =>
                  item.id === annotation.id ? { ...item, note: event.target.value } : item))}
              />
              <Button danger size="small" onClick={() => setAnnotations((current) => current.filter((item) => item.id !== annotation.id))}>
                {t("contentViewer.annotation.remove")}
              </Button>
            </div>
          ))}
          <Button type="primary" size="small" disabled={!annotations.some((annotation) => annotation.note.trim())} onClick={handoff}>
            {t("contentViewer.annotation.handoff")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

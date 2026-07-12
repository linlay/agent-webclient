import React, { useCallback, useEffect, useRef, useState } from "react";
import { getViewport } from "@/shared/data";
import { safeJsonParse } from "@/shared/utils/safeJsonParse";
import { useI18n } from "@/shared/i18n";

interface ViewportEmbedProps {
  viewportKey: string;
  signature: string;
  payload?: unknown;
  payloadRaw?: string;
}

export interface ViewportInitFrame {
  addEventListener: (type: "load", listener: () => void) => void;
  removeEventListener: (type: "load", listener: () => void) => void;
}

const TIMELINE_CONTENT_VIEWPORT_CLASS_NAME =
  "timeline-content-viewport tw:overflow-hidden";
const TIMELINE_CONTENT_VIEWPORT_BODY_CLASS_NAME =
  "timeline-content-viewport-body tw:min-h-[58px]";
const TIMELINE_CONTENT_VIEWPORT_FRAME_CLASS_NAME =
  "timeline-content-viewport-frame tw:h-[min(320px,48vh)] tw:w-full tw:border-0 tw:pointer-events-none";

export function bindViewportInitListener(
  frame: ViewportInitFrame,
  sendInit: () => void,
): () => void {
  frame.addEventListener("load", sendInit);
  sendInit();
  return () => {
    frame.removeEventListener("load", sendInit);
  };
}

export function shouldPostViewportUpdate(input: {
  html: string;
  currentFrameKey: string;
  expectedFrameKey: string;
  lastPostedSignature: string;
  signature: string;
}): boolean {
  if (!input.html) {
    return false;
  }
  if (input.currentFrameKey !== input.expectedFrameKey) {
    return false;
  }
  return input.lastPostedSignature !== input.signature;
}

/**
 * ViewportEmbed — renders a single embedded viewport.
 * Calls /api/viewport?viewportKey=<key> to fetch HTML,
 * renders it in an iframe, then postMessage(payload) to the iframe
 * so the viewport HTML can populate its data.
 */
export const ViewportEmbed: React.FC<ViewportEmbedProps> = ({
  viewportKey,
  signature,
  payload,
  payloadRaw,
}) => {
  const { t } = useI18n();
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentFrameKeyRef = useRef("");
  const lastPostedSignatureRef = useRef("");

  useEffect(() => {
    if (!viewportKey || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);

    getViewport(viewportKey)
      .then((response) => {
        const data = response.data as Record<string, unknown>;
        const responseHtml = data?.html;
        if (typeof responseHtml !== "string" || !responseHtml.trim()) {
          throw new Error("Viewport response does not contain html");
        }
        setHtml(responseHtml);
        setError("");
      })
      .catch((err) => {
        setError(t("viewport.loadFailed", { detail: (err as Error).message }));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t, viewportKey]);

  const postToFrame = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    try {
      const messagePayload = payload ?? safeJsonParse(payloadRaw || "{}", {});
      iframe.contentWindow.postMessage(messagePayload, "*");
      lastPostedSignatureRef.current = signature;
    } catch (err) {
      console.warn("viewport postMessage failed:", err);
    }

    resizeIframe(iframe);
  }, [payload, payloadRaw, signature]);

  useEffect(() => {
    currentFrameKeyRef.current = "";
    lastPostedSignatureRef.current = "";
  }, [html, viewportKey]);

  useEffect(() => {
    if (!html || !iframeRef.current) return;

    const iframe = iframeRef.current;
    const expectedKey = `${viewportKey}::${html}`;
    const sendInit = () => {
      currentFrameKeyRef.current = expectedKey;
      postToFrame();
    };

    return bindViewportInitListener(iframe, sendInit);
  }, [html, postToFrame, viewportKey]);

  useEffect(() => {
    const expectedFrameKey = `${viewportKey}::${html}`;
    if (
      !shouldPostViewportUpdate({
        html,
        currentFrameKey: currentFrameKeyRef.current,
        expectedFrameKey,
        lastPostedSignature: lastPostedSignatureRef.current,
        signature,
      })
    ) {
      return;
    }

    postToFrame();
  }, [html, postToFrame, signature, viewportKey]);

  return (
    <div className={TIMELINE_CONTENT_VIEWPORT_CLASS_NAME}>
      <div className={TIMELINE_CONTENT_VIEWPORT_BODY_CLASS_NAME}>
        {loading && <div className="status-line">{t("viewport.loading")}</div>}
        {error && <div className="system-alert">{error}</div>}
        {html && (
          <iframe
            ref={iframeRef}
            className={TIMELINE_CONTENT_VIEWPORT_FRAME_CLASS_NAME}
            srcDoc={html}
            sandbox="allow-scripts allow-same-origin"
            title={`viewport-${viewportKey}`}
          />
        )}
      </div>
    </div>
  );
};

function resizeIframe(iframe: HTMLIFrameElement): void {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc?.body) {
      const height = Math.max(doc.body.scrollHeight, 100);
      iframe.style.height = `${height}px`;

      setTimeout(() => {
        try {
          const nextHeight = Math.max(doc.body.scrollHeight, 100);
          iframe.style.height = `${nextHeight}px`;
        } catch {
          /* ignore */
        }
      }, 500);
      return;
    }
  } catch {
    /* ignore */
  }

  iframe.style.height = "300px";
}

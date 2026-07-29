import React from "react";
import type { WebPreviewState } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";

interface WebPreviewPanelProps {
  preview: WebPreviewState;
  refreshKey?: number;
}

const WEB_PREVIEW_PANEL_CLASS_NAME =
  "web-preview-panel tw:flex tw:h-full tw:min-h-0 tw:flex-col";
const WEB_PREVIEW_FRAME_CLASS_NAME =
  "web-preview-frame tw:min-h-0 tw:w-full tw:flex-1 tw:border-0 tw:bg-white";

export const WEB_PREVIEW_IFRAME_SANDBOX =
  "allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts";

export const WebPreviewPanel: React.FC<WebPreviewPanelProps> = ({
  preview,
  refreshKey,
}) => {
  const { t } = useI18n();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const prevRefreshKeyRef = React.useRef(refreshKey);

  React.useEffect(() => {
    if (
      refreshKey !== undefined &&
      refreshKey !== prevRefreshKeyRef.current &&
      iframeRef.current
    ) {
      iframeRef.current.src = preview.url;
      prevRefreshKeyRef.current = refreshKey;
    }
  }, [refreshKey, preview.url]);

  return (
    <section
      className={WEB_PREVIEW_PANEL_CLASS_NAME}
      aria-label={t("rightSidebar.web.ariaLabel", { title: preview.title })}
    >
      <iframe
        ref={iframeRef}
        className={WEB_PREVIEW_FRAME_CLASS_NAME}
        src={preview.url}
        title={preview.title}
        sandbox={WEB_PREVIEW_IFRAME_SANDBOX}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </section>
  );
};

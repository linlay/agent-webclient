import React from "react";
import { useSearchParams } from "react-router-dom";
import { WebPreviewPanel } from "@/features/web-preview/components/WebPreviewPanel";
import { isAllowedWebSurfaceUrl } from "@/features/surfaces/surfaceRoutes";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export const WebViewerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const url = String(searchParams.get("url") || "").trim();
  const title = String(searchParams.get("title") || "").trim() || url;
  const valid = isAllowedWebSurfaceUrl(url);
  return (
    <IndependentSurfaceFrame
      kind="web"
      error={valid ? "" : t("platformError.code.invalid_request")}
    >
      {valid ? <WebPreviewPanel preview={{ url, title }} /> : null}
    </IndependentSurfaceFrame>
  );
};

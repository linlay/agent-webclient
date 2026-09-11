import React from "react";
import { message } from "antd";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { openStandaloneViewerTarget } from "@/features/viewers/lib/viewerRuntime";
import {
  canUseStandaloneFileActions,
  getStandaloneFileCapabilities,
  type StandaloneFileAction,
  type StandaloneFileCapabilities,
} from "@/shared/data/standalone/standaloneFileActions";
import { useI18n } from "@/shared/i18n";

export function useStandaloneViewerActions(
  target: ViewerTarget,
  chatId: string,
  teamChat?: boolean,
  enabled = true,
) {
  const { t } = useI18n();
  const [capabilities, setCapabilities] = React.useState<StandaloneFileCapabilities | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [pending, setPending] = React.useState<StandaloneFileAction | null>(null);
  const pendingRef = React.useRef(false);
  const localServiceCandidate = canUseStandaloneFileActions();

  React.useEffect(() => {
    let disposed = false;
    setCapabilities(null);
    setChecking(enabled && localServiceCandidate);
    if (enabled && localServiceCandidate) {
      void getStandaloneFileCapabilities()
        .then((result) => {
          if (!disposed) setCapabilities(result);
        })
        .finally(() => {
          if (!disposed) setChecking(false);
        });
    }
    return () => { disposed = true; };
  }, [enabled, localServiceCandidate]);

  const run = async (action: StandaloneFileAction) => {
    if (!localServiceCandidate || !capabilities || pendingRef.current) return;
    pendingRef.current = true;
    setPending(action);
    try {
      await openStandaloneViewerTarget(action, target, { chatId, teamChat }, capabilities);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("contentViewer.localAction.failed"));
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };

  const platform = capabilities?.platform || (typeof navigator === "undefined" ? "" : navigator.platform);
  const revealLabel = t(/mac|darwin/iu.test(platform)
    ? "contentViewer.localAction.revealInFinder"
    : /win/iu.test(platform)
      ? "contentViewer.localAction.revealInExplorer"
      : "contentViewer.localAction.revealInFileManager");
  const hint = capabilities
    ? undefined
    : checking
      ? t("contentViewer.localAction.checking")
      : t(localServiceCandidate ? "contentViewer.localAction.unavailable" : "contentViewer.localAction.localOnly");

  return { run, revealLabel, hint, pending, disabled: Boolean(pending) || !capabilities };
}

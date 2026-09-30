import React from "react";
import type { WorkPanelLocalApplication } from "@/shared/contracts/generated/agentWebclientBridge";
import { useI18n } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, type DesktopLiveSurfaceActiveEventDetail } from "@/shared/data/desktop/desktopSurfaceLifecycle";
import {
  desktopDocumentSourceKey, desktopDocumentOpenErrorKey, getDesktopDocumentOpenOptions, isDesktopLocalOpenDocument,
  openDesktopDocumentInLocalApp, resolveDesktopDocumentSource,
} from "../lib/desktopDocumentOpen";
import type { ViewerTarget } from "../lib/viewerTarget";

interface OpenState {
  key: string;
  available: boolean;
  resolved: boolean;
  checking: boolean;
  busy: boolean;
  applications: WorkPanelLocalApplication[];
  queryError?: string;
  actionError?: string;
}

const emptyState = (key: string): OpenState => ({ key, available: false, resolved: false, checking: false, busy: false, applications: [] });

export function useDesktopDocumentOpen(target: ViewerTarget, refreshKey = 0) {
  const { t } = useI18n();
  const source = resolveDesktopDocumentSource(target);
  const enabled = isDesktopAppMode() && isDesktopLocalOpenDocument(target.name) && Boolean(source);
  const key = JSON.stringify([enabled && source ? desktopDocumentSourceKey(source) : "", refreshKey]);
  const currentKey = React.useRef(key);
  currentKey.current = key;
  const querySequence = React.useRef(0);
  const pendingOpen = React.useRef<string | null>(null);
  const live = React.useRef(false);
  const [state, setState] = React.useState<OpenState>(() => emptyState(key));
  const active = state.key === key ? state : emptyState(key);

  React.useEffect(() => {
    live.current = true;
    return () => { live.current = false; querySequence.current += 1; };
  }, []);

  const refresh = React.useCallback(async () => {
    if (!enabled || !source || pendingOpen.current === key) return;
    const sequence = ++querySequence.current;
    setState((previous) => ({ ...(previous.key === key ? previous : emptyState(key)), checking: true }));
    const result = await getDesktopDocumentOpenOptions(source);
    if (!live.current || currentKey.current !== key || querySequence.current !== sequence) return;
    setState((previous) => result.available
      ? { ...previous, key, available: true, resolved: true, checking: false, applications: result.applications, queryError: result.error }
      : { ...emptyState(key), resolved: true });
  }, [enabled, key]);

  React.useEffect(() => {
    if (!enabled) { setState(emptyState(key)); return; }
    void refresh();
    const onFocus = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const onActive = (event: Event) => {
      if ((event as CustomEvent<DesktopLiveSurfaceActiveEventDetail>).detail?.active) void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, onActive);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      querySequence.current += 1;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, onActive);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, key, refresh]);

  const open = async (applicationId: string) => {
    const application = active.applications.find((item) => item.id === applicationId);
    if (!enabled || !source || !active.available || pendingOpen.current || !application) return;
    pendingOpen.current = key;
    setState((previous) => ({ ...previous, busy: true, actionError: undefined }));
    try {
      const result = await openDesktopDocumentInLocalApp(source, applicationId);
      if (!live.current || currentKey.current !== key) return;
      setState((previous) => result.ok
        ? { ...previous, busy: false }
        : { ...previous, busy: false, actionError: t(desktopDocumentOpenErrorKey(result.error, "open")) });
    } catch (error) {
      if (live.current && currentKey.current === key) setState((previous) => ({ ...previous, busy: false,
        actionError: t(desktopDocumentOpenErrorKey(error, "open")) }));
    } finally {
      if (pendingOpen.current === key) pendingOpen.current = null;
      if (live.current && currentKey.current !== key) setState((previous) => ({ ...previous, busy: false }));
    }
  };

  return { ...active, busy: active.busy || pendingOpen.current !== null, refresh, open };
}

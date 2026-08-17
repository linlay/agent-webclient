export const SERVICE_WEBVIEW_BRIDGE_SURFACE_LIFECYCLE_CHANNEL =
  "desktop:service-webview:surface-lifecycle";
export const DESKTOP_SURFACE_ACTIVE_CHANGED_MESSAGE_TYPE =
  "desktopSurfaceActiveChanged";
export const DESKTOP_LIVE_SURFACE_ACTIVE_EVENT =
  "agent:desktop-live-surface-active";

export type DesktopLiveSurfaceActiveEventDetail = {
  active: boolean;
  surfaceId?: string;
};

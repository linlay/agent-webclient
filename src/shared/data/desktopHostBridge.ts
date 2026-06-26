import { isAppMode } from "@/shared/utils/routing";

export const DESKTOP_WEBVIEW_BRIDGE_FLAG = "__ZENMIND_DESKTOP_WEBVIEW_BRIDGE__";

export type DesktopBridgeWindow = Window & typeof globalThis & {
  __ZENMIND_DESKTOP_WEBVIEW_BRIDGE__?: boolean;
};

export function hasDesktopHostBridge(): boolean {
  if (typeof window === "undefined" || !isAppMode()) {
    return false;
  }
  const desktopWindow = window as DesktopBridgeWindow;
  if (desktopWindow.__ZENMIND_DESKTOP_WEBVIEW_BRIDGE__ === true) {
    return true;
  }
  return Boolean(window.parent && window.parent !== window);
}

export function getDesktopHostMessageSource(): Window | null {
  if (!hasDesktopHostBridge()) {
    return null;
  }
  return window.parent && window.parent !== window ? window.parent : window;
}

export function isDesktopHostMessageEvent(event: MessageEvent): boolean {
  const source = getDesktopHostMessageSource();
  if (!source) {
    return false;
  }
  return event.source === source;
}

export function postDesktopHostMessage(message: unknown): boolean {
  if (!hasDesktopHostBridge()) {
    return false;
  }
  try {
    if (window.parent && typeof window.parent.postMessage === "function") {
      window.parent.postMessage(message, "*");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

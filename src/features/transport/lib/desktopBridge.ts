import type {
  AgentWebclientWorkPanelBridge,
  DesktopPlatformWsBridge,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import {
  AGENT_WEBCLIENT_PLATFORM_WS_TRANSPORT_VERSION,
} from "@/features/transport/contracts/generated/agentWebclientBridge";

declare global {
  interface Window {
    __AGENT_WEBCLIENT_PLATFORM_WS__?: DesktopPlatformWsBridge;
    __AGENT_WEBCLIENT_WORKPANEL_BRIDGE__?: AgentWebclientWorkPanelBridge;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasMethods(value: unknown, methods: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return methods.every((method) => typeof value[method] === "function");
}

export function isDesktopPlatformWsBridge(
  value: unknown,
): value is DesktopPlatformWsBridge {
  return isRecord(value)
    && value.transportVersion === AGENT_WEBCLIENT_PLATFORM_WS_TRANSPORT_VERSION
    && hasMethods(value, ["createSocket"]);
}

export function isDesktopWorkPanelBridge(
  value: unknown,
): value is AgentWebclientWorkPanelBridge {
  return hasMethods(value, ["getCapabilities", "openItem", "activateItem", "closeItem"]);
}

export function readDesktopBridges(): {
  platformWs: DesktopPlatformWsBridge | null;
  workPanel: AgentWebclientWorkPanelBridge | null;
  platformWsIncompatible: boolean;
} {
  if (typeof window === "undefined") {
    return { platformWs: null, workPanel: null, platformWsIncompatible: false };
  }
  const platformWsCandidate = window.__AGENT_WEBCLIENT_PLATFORM_WS__;
  return {
    platformWs: isDesktopPlatformWsBridge(platformWsCandidate)
      ? platformWsCandidate
      : null,
    workPanel: isDesktopWorkPanelBridge(window.__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__)
      ? window.__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__
      : null,
    platformWsIncompatible: Boolean(platformWsCandidate)
      && !isDesktopPlatformWsBridge(platformWsCandidate),
  };
}

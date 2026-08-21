import type {
  AgentWebclientWorkPanelBridge,
  DesktopPlatformFramePort,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import {
  AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_TRANSPORT_VERSION,
} from "@/features/transport/contracts/generated/agentWebclientBridge";

declare global {
  interface Window {
    __AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__?: DesktopPlatformFramePort;
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

export function isDesktopPlatformFramePort(
  value: unknown,
): value is DesktopPlatformFramePort {
  return isRecord(value)
    && value.transportVersion === AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_TRANSPORT_VERSION
    && hasMethods(value, ["createSession"]);
}

export function isDesktopWorkPanelBridge(
  value: unknown,
): value is AgentWebclientWorkPanelBridge {
  return hasMethods(value, ["getCapabilities", "openItem", "activateItem", "closeItem"]);
}

export function readDesktopBridges(): {
  platformFramePort: DesktopPlatformFramePort | null;
  workPanel: AgentWebclientWorkPanelBridge | null;
  platformFramePortIncompatible: boolean;
} {
  if (typeof window === "undefined") {
    return { platformFramePort: null, workPanel: null, platformFramePortIncompatible: false };
  }
  const platformFramePortCandidate = window.__AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__;
  return {
    platformFramePort: isDesktopPlatformFramePort(platformFramePortCandidate)
      ? platformFramePortCandidate
      : null,
    workPanel: isDesktopWorkPanelBridge(window.__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__)
      ? window.__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__
      : null,
    platformFramePortIncompatible: Boolean(platformFramePortCandidate)
      && !isDesktopPlatformFramePort(platformFramePortCandidate),
  };
}

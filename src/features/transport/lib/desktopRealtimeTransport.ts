import type {
  DesktopPlatformWsBridge,
  DesktopPlatformSocket,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import type {
  RealtimeConnectionStatus,
  RealtimeTransport,
  StatusListener,
} from "@/features/transport/contracts/realtimeTransport";
import { PlatformPushTransport } from "@/features/transport/lib/platformPushTransport";
import { PlatformRunTransport } from "@/features/transport/lib/platformRunTransport";
import { UnsupportedTerminalTransport } from "@/features/transport/lib/unsupportedTerminalTransport";
import type { WsClient, WsSocketLike } from "@/features/transport/lib/wsClient";
import {
  destroyWsClient,
  initWsClient,
  subscribeWsStatus,
} from "@/features/transport/lib/wsClientSingleton";
import {
  DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
  DESKTOP_SURFACE_ACTIVE_CHANGED_MESSAGE_TYPE,
  SERVICE_WEBVIEW_BRIDGE_SURFACE_LIFECYCLE_CHANNEL,
  type DesktopLiveSurfaceActiveEventDetail,
} from "@/features/transport/lib/desktopSurfaceLifecycle";

type DesktopLifecycleElectronApi = {
  onFromMain?: (
    channel: string,
    listener: (event: unknown, payload: Record<string, unknown>) => void,
  ) => unknown;
};

function asWsSocket(socket: DesktopPlatformSocket): WsSocketLike {
  return socket as WsSocketLike;
}

export class DesktopRealtimeTransport implements RealtimeTransport {
  readonly kind = "desktop" as const;
  readonly runs: PlatformRunTransport;
  readonly push: PlatformPushTransport;
  readonly terminal = new UnsupportedTerminalTransport();
  private readonly client: WsClient;
  private readonly handleVisibilityChange: () => void;
  private readonly unsubscribeSurfaceLifecycle: () => void;
  private hostSurfaceActive = true;
  private documentVisible = true;
  private effectiveSurfaceActive = true;
  private disposed = false;

  constructor(readonly platformWs: DesktopPlatformWsBridge) {
    destroyWsClient();
    this.client = initWsClient({
      accessToken: "",
      allowAnonymous: true,
      buildSocketUrl: () => "desktop-platform-frame-port",
      socketFactory: () => asWsSocket(platformWs.createSocket()),
    });
    const ensureClient = async () => this.client;
    this.runs = new PlatformRunTransport(ensureClient, { supportsBtw: false });
    this.push = new PlatformPushTransport(ensureClient);
    this.handleVisibilityChange = () => {
      this.documentVisible = document.visibilityState !== "hidden";
      this.syncSurfaceActive();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.handleVisibilityChange();
    }
    const electronApi = typeof window === "undefined"
      ? null
      : (window as Window & typeof globalThis & { electronAPI?: DesktopLifecycleElectronApi }).electronAPI;
    const maybeUnsubscribe = electronApi?.onFromMain?.(
      SERVICE_WEBVIEW_BRIDGE_SURFACE_LIFECYCLE_CHANNEL,
      (_event, payload) => {
        if (payload?.type !== DESKTOP_SURFACE_ACTIVE_CHANGED_MESSAGE_TYPE) return;
        this.hostSurfaceActive = payload.active === true;
        this.syncSurfaceActive(String(payload.surfaceId || "").trim());
      },
    );
    this.unsubscribeSurfaceLifecycle = typeof maybeUnsubscribe === "function"
      ? maybeUnsubscribe as () => void
      : () => undefined;
  }

  private syncSurfaceActive(surfaceId = ""): void {
    const active = this.hostSurfaceActive && this.documentVisible;
    if (this.effectiveSurfaceActive === active) return;
    this.effectiveSurfaceActive = active;
    this.runs.setSurfaceActive(active);
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function" &&
      typeof CustomEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent<DesktopLiveSurfaceActiveEventDetail>(
        DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
        { detail: { active, surfaceId } },
      ));
    }
  }

  getStatus(): RealtimeConnectionStatus {
    return this.disposed ? "disposed" : this.client.getStatus();
  }

  subscribeStatus(listener: StatusListener): () => void {
    if (this.disposed) {
      listener("disposed");
      return () => undefined;
    }
    listener(this.getStatus());
    return subscribeWsStatus(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    this.unsubscribeSurfaceLifecycle();
    destroyWsClient();
  }
}

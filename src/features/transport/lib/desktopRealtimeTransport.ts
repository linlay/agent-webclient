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
      this.runs.setSurfaceActive(document.visibilityState !== "hidden");
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.handleVisibilityChange();
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
    destroyWsClient();
  }
}

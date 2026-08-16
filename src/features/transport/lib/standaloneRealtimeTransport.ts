import type {
  RealtimeConnectionStatus,
  RealtimeTransport,
  StatusListener,
} from "@/features/transport/contracts/realtimeTransport";
import { StandaloneInboundRequestTransport } from "@/features/transport/lib/standaloneInboundRequestTransport";
import { PlatformPushTransport } from "@/features/transport/lib/platformPushTransport";
import { PlatformRunTransport } from "@/features/transport/lib/platformRunTransport";
import { StandaloneTerminalTransport } from "@/features/transport/lib/standaloneTerminalTransport";
import {
  destroyWsClient,
  getWsClient,
  subscribeWsStatus,
} from "@/features/transport/lib/wsClientSingleton";

export class StandaloneRealtimeTransport implements RealtimeTransport {
  readonly kind = "standalone" as const;
  readonly runs = new PlatformRunTransport();
  readonly push = new PlatformPushTransport();
  readonly inbound = new StandaloneInboundRequestTransport();
  readonly terminal = new StandaloneTerminalTransport();
  private disposed = false;

  getStatus(): RealtimeConnectionStatus {
    if (this.disposed) return "disposed";
    return getWsClient()?.getStatus() || "disconnected";
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
    this.terminal.dispose();
    destroyWsClient();
  }
}

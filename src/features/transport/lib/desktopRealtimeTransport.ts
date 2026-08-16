import type {
  RealtimeConnectionStatus,
  RealtimeTransport,
  StatusListener,
} from "@/features/transport/contracts/realtimeTransport";
import { DesktopBridgeSession } from "@/features/transport/lib/desktopBridge";
import { DesktopPushTransport } from "@/features/transport/lib/desktopPushTransport";
import { DesktopRunTransport } from "@/features/transport/lib/desktopRunTransport";
import { UnsupportedTerminalTransport } from "@/features/transport/lib/unsupportedTerminalTransport";

export class DesktopRealtimeTransport implements RealtimeTransport {
  readonly kind = "desktop" as const;
  readonly runs: DesktopRunTransport;
  readonly push: DesktopPushTransport;
  readonly terminal = new UnsupportedTerminalTransport();
  private disposed = false;

  constructor(readonly bridgeSession: DesktopBridgeSession) {
    this.runs = new DesktopRunTransport(bridgeSession);
    this.push = new DesktopPushTransport(bridgeSession);
  }

  getStatus(): RealtimeConnectionStatus {
    return this.bridgeSession.getStatus();
  }

  subscribeStatus(listener: StatusListener): () => void {
    return this.bridgeSession.subscribeStatus(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runs.dispose();
    this.push.dispose();
    this.bridgeSession.dispose();
  }
}

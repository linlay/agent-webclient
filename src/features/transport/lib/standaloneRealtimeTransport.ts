import type {
  RealtimeConnectionStatus,
  RealtimeTransport,
  StatusListener,
} from "@/features/transport/contracts/realtimeTransport";
import { StandaloneInboundRequestTransport } from "@/features/transport/lib/standaloneInboundRequestTransport";
import { PlatformPushTransport } from "@/features/transport/lib/platformPushTransport";
import { PlatformRunTransport } from "@/features/transport/lib/platformRunTransport";
import { TerminalSocketTransport } from "@/features/transport/lib/terminalSocketTransport";
import { StandaloneTerminalStatusSubscriber } from "@/features/transport/lib/terminalStatusSubscriber";
import { resolveStandaloneAccessToken } from "@/features/transport/lib/standaloneWsClient";
import { StandaloneBtwStreamClient } from "@/features/transport/lib/standaloneBtwStreamClient";
import { usesGatewaySession } from "@/shared/config/authMode";
import { getClientDeviceId } from "@/shared/data/clientDeviceId";
import {
  destroyWsClient,
  getWsClient,
  subscribeWsStatus,
} from "@/features/transport/lib/wsClientSingleton";

export class StandaloneRealtimeTransport implements RealtimeTransport {
  readonly kind = "standalone" as const;
  private readonly btwClient = new StandaloneBtwStreamClient();
  private readonly terminalStatus = new StandaloneTerminalStatusSubscriber();
  readonly runs = new PlatformRunTransport(undefined, { ensureBtwClient: async () => this.btwClient });
  readonly push = new PlatformPushTransport();
  readonly inbound = new StandaloneInboundRequestTransport();
  readonly terminal = new TerminalSocketTransport({
    resolveAccessToken: usesGatewaySession() ? undefined : resolveStandaloneAccessToken,
    getDeviceId: getClientDeviceId,
    subscribeStatus: (listener) => this.terminalStatus.subscribe(listener),
    disposeStatus: () => this.terminalStatus.dispose(),
  });
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
    this.btwClient.dispose();
    this.terminal.dispose();
    destroyWsClient();
  }
}

import type {
  AgentWebclientBridgeFailure,
  AgentWebclientBridgeHello,
  AgentWebclientRealtimeBridge,
  AgentWebclientRealtimeMessage,
  AgentWebclientSurfaceCapability,
  AgentWebclientWorkPanelBridge,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import {
  AGENT_WEBCLIENT_BRIDGE_VERSION,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import type {
  RealtimeConnectionStatus,
  StatusListener,
} from "@/features/transport/contracts/realtimeTransport";
import {
  fromDesktopBridgeError,
  RealtimeTransportError,
} from "@/features/transport/contracts/realtimeTransportErrors";

declare global {
  interface Window {
    __AGENT_WEBCLIENT_REALTIME_BRIDGE__?: AgentWebclientRealtimeBridge;
    __AGENT_WEBCLIENT_WORKPANEL_BRIDGE__?: AgentWebclientWorkPanelBridge;
  }
}

type MessageListener = (message: AgentWebclientRealtimeMessage) => void;
type FatalListener = (error: RealtimeTransportError | null) => void;

const SURFACE_HELLO_RETRY_DELAYS_MS = [25, 50, 100, 200, 400] as const;

function waitForSurfaceRegistration(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasMethods(value: unknown, methods: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return methods.every((method) => typeof value[method] === "function");
}

export function isDesktopRealtimeBridge(
  value: unknown,
): value is AgentWebclientRealtimeBridge {
  return hasMethods(value, [
    "hello",
    "request",
    "subscribe",
    "detach",
    "onMessage",
  ]);
}

export function isDesktopWorkPanelBridge(
  value: unknown,
): value is AgentWebclientWorkPanelBridge {
  return hasMethods(value, ["openItem", "activateItem", "closeItem"]);
}

export function readDesktopBridges(): {
  realtime: AgentWebclientRealtimeBridge | null;
  workPanel: AgentWebclientWorkPanelBridge | null;
  realtimeIncompatible: boolean;
} {
  if (typeof window === "undefined") {
    return { realtime: null, workPanel: null, realtimeIncompatible: false };
  }
  const realtimeCandidate = window.__AGENT_WEBCLIENT_REALTIME_BRIDGE__;
  return {
    realtime: isDesktopRealtimeBridge(realtimeCandidate)
      ? realtimeCandidate
      : null,
    workPanel: isDesktopWorkPanelBridge(window.__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__)
      ? window.__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__
      : null,
    realtimeIncompatible: Boolean(realtimeCandidate) && !isDesktopRealtimeBridge(realtimeCandidate),
  };
}

function isFailure(
  value: AgentWebclientBridgeHello | AgentWebclientBridgeFailure,
): value is AgentWebclientBridgeFailure {
  return "ok" in value && value.ok === false;
}

function connectionStatus(
  phase: AgentWebclientBridgeHello["connection"]["phase"],
): RealtimeConnectionStatus {
  if (phase === "connected") return "connected";
  if (phase === "connecting" || phase === "reconnecting") return "connecting";
  if (phase === "error") return "error";
  return "disconnected";
}

export class DesktopBridgeSession {
  readonly realtime: AgentWebclientRealtimeBridge;

  private helloPromise: Promise<AgentWebclientBridgeHello> | null = null;
  private removeBridgeListener: (() => void) | null = null;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly fatalListeners = new Set<FatalListener>();
  private status: RealtimeConnectionStatus = "disconnected";
  private fatalError: RealtimeTransportError | null = null;
  private disposed = false;

  constructor(realtime: AgentWebclientRealtimeBridge) {
    this.realtime = realtime;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new RealtimeTransportError(
        "transport_disposed",
        "Desktop realtime transport has been disposed",
      );
    }
  }

  private ensureBridgeListener(): void {
    this.assertActive();
    if (this.removeBridgeListener) return;
    this.removeBridgeListener = this.realtime.onMessage((message) => {
      if (this.disposed) return;
      if (message.version !== AGENT_WEBCLIENT_BRIDGE_VERSION) {
        this.setFatal(new RealtimeTransportError(
          "version_mismatch",
          `Desktop bridge message version ${String(message.version)} is incompatible`,
        ));
        return;
      }
      if (message.kind === "connection") {
        this.setStatus(connectionStatus(message.phase));
      }
      for (const listener of this.messageListeners) listener(message);
    });
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private setFatal(error: RealtimeTransportError): void {
    if (this.fatalError) return;
    this.fatalError = error;
    this.setStatus("error");
    for (const listener of this.fatalListeners) listener(error);
  }

  private async requestHello(): Promise<AgentWebclientBridgeHello> {
    for (let attempt = 0; ; attempt += 1) {
      this.assertActive();
      const result = await this.realtime.hello();
      if (isFailure(result)) {
        const error = fromDesktopBridgeError(result.error);
        const retryDelay = SURFACE_HELLO_RETRY_DELAYS_MS[attempt];
        if (error.code === "surface_unavailable" && retryDelay !== undefined) {
          await waitForSurfaceRegistration(retryDelay);
          continue;
        }
        if (error.code === "version_mismatch") this.setFatal(error);
        throw error;
      }
      if (result.version !== AGENT_WEBCLIENT_BRIDGE_VERSION) {
        const error = new RealtimeTransportError(
          "version_mismatch",
          `Desktop bridge version ${String(result.version)} is incompatible`,
        );
        this.setFatal(error);
        throw error;
      }
      this.setStatus(connectionStatus(result.connection.phase));
      return result;
    }
  }

  async hello(): Promise<AgentWebclientBridgeHello> {
    this.assertActive();
    this.ensureBridgeListener();
    if (!this.helloPromise) {
      const pending = this.requestHello();
      this.helloPromise = pending;
      void pending.catch((error) => {
        if (this.helloPromise === pending && this.fatalError === null) {
          this.helloPromise = null;
        }
        return error;
      });
    }
    return this.helloPromise;
  }

  async requireCapability(
    capability: AgentWebclientSurfaceCapability,
  ): Promise<AgentWebclientBridgeHello> {
    const hello = await this.hello();
    if (!hello.surface.capabilities.includes(capability)) {
      throw new RealtimeTransportError(
        "capability_denied",
        `${hello.surface.kind} does not have ${capability}`,
      );
    }
    return hello;
  }

  subscribeMessages(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  getStatus(): RealtimeConnectionStatus {
    return this.disposed ? "disposed" : this.status;
  }

  subscribeStatus(listener: StatusListener): () => void {
    listener(this.getStatus());
    if (this.disposed) return () => undefined;
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  subscribeFatal(listener: FatalListener): () => void {
    listener(this.fatalError);
    if (this.disposed) return () => undefined;
    this.fatalListeners.add(listener);
    return () => this.fatalListeners.delete(listener);
  }

  getFatalError(): RealtimeTransportError | null {
    return this.fatalError;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeBridgeListener?.();
    this.removeBridgeListener = null;
    this.messageListeners.clear();
    this.statusListeners.clear();
    this.fatalListeners.clear();
    this.status = "disposed";
  }
}

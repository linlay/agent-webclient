import type {
  AgentPlatformRequestFrame,
  DesktopPlatformConnectionState,
  DesktopPlatformSession,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import type {
  RealtimeConnectionStatus,
  StatusListener,
} from "@/features/transport/contracts/realtimeTransport";
import { PlatformFrameClient } from "@/features/transport/lib/platformFrameClient";

type ConnectionWaiter = {
  resolve(): void;
  reject(error: Error): void;
};

export class DesktopFramePortClosedError extends Error {
  readonly code = "DESKTOP_FRAME_PORT_CLOSED";

  constructor(message = "Desktop Platform Frame Port is closed") {
    super(message);
    this.name = "DesktopFramePortClosedError";
  }
}

export class PlatformConnectionUnavailableError extends Error {
	readonly code = "PLATFORM_CONNECTION_UNAVAILABLE";
	readonly retryable = true;

	constructor(message = "Agent Platform connection is reconnecting") {
		super(message);
		this.name = "PlatformConnectionUnavailableError";
	}
}

function toRealtimeStatus(state: DesktopPlatformConnectionState): RealtimeConnectionStatus {
  if (state.phase === "connected") return "connected";
  if (state.phase === "reconnecting") return "reconnecting";
  if (state.phase === "closed") return "disconnected";
  return "connecting";
}

/** Desktop host driver: no URL, credentials, heartbeat timer, or reconnect loop. */
export class DesktopFramePortDriver extends PlatformFrameClient {
  private readonly statusListeners = new Set<StatusListener>();
  private readonly connectionWaiters = new Set<ConnectionWaiter>();
  private readonly unsubscribers: Array<() => void>;
  private status: RealtimeConnectionStatus = "connecting";
  private disposed = false;
  private permanentlyClosed = false;

  constructor(
    private readonly session: DesktopPlatformSession,
    requestTimeoutMs = 30_000,
  ) {
    super(requestTimeoutMs);
    this.unsubscribers = [
      session.onFrame((frame) => this.dispatchPlatformFrame(frame)),
      session.onState((state) => this.handleState(state)),
      session.onClose((event) => {
        this.permanentlyClosed = true;
        this.setStatus("disconnected");
        this.handlePermanentClose(new DesktopFramePortClosedError(
          event.error?.message || `Desktop Platform Frame Port closed: ${event.reason}`,
        ));
      }),
    ];
  }

	connect(signal?: AbortSignal): Promise<void> {
		if (this.disposed || this.permanentlyClosed) {
			return Promise.reject(new DesktopFramePortClosedError());
		}
		if (signal?.aborted) {
			return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
		}
		if (this.status === "connected") return Promise.resolve();
		if (this.status === "reconnecting") {
			return Promise.reject(new PlatformConnectionUnavailableError());
		}
		return new Promise<void>((resolve, reject) => {
			let waiter: ConnectionWaiter;
			const abortHandler = () => {
				this.connectionWaiters.delete(waiter);
				reject(new DOMException("The operation was aborted.", "AbortError"));
			};
			if (signal) {
				signal.addEventListener("abort", abortHandler, { once: true });
			}
			waiter = {
				resolve: () => {
					signal?.removeEventListener("abort", abortHandler);
					resolve();
				},
				reject: (error) => {
					signal?.removeEventListener("abort", abortHandler);
					reject(error);
				},
			};
			this.connectionWaiters.add(waiter);
		});
	}

  getStatus(): RealtimeConnectionStatus {
    return this.disposed ? "disposed" : this.status;
  }

  subscribeStatus(listener: StatusListener): () => void {
    if (this.disposed) {
      listener("disposed");
      return () => undefined;
    }
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.session.close("disposed");
    const error = new DesktopFramePortClosedError("Desktop Platform Frame Port disposed");
    this.handlePermanentClose(error);
    this.disposePlatformFrames(error);
    this.setStatus("disposed");
  }

	protected sendRequestFrame(frame: AgentPlatformRequestFrame): void {
		if (this.disposed || this.permanentlyClosed) {
			throw new DesktopFramePortClosedError();
		}
		if (this.status !== "connected") throw new PlatformConnectionUnavailableError();
		this.session.send(frame);
	}

  private handleState(state: DesktopPlatformConnectionState): void {
    if (this.disposed) return;
    const next = toRealtimeStatus(state);
    this.setStatus(next);
    if (next === "connected") {
      for (const waiter of this.connectionWaiters) waiter.resolve();
      this.connectionWaiters.clear();
    } else if (next === "disconnected") {
      this.permanentlyClosed = true;
      this.handlePermanentClose(new DesktopFramePortClosedError(
        state.error?.message || "Desktop Platform Frame Port closed",
      ));
    }
  }

  private handlePermanentClose(error: Error): void {
    for (const waiter of this.connectionWaiters) waiter.reject(error);
    this.connectionWaiters.clear();
    this.failPlatformFrames(error);
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

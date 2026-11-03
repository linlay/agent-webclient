import type {
  AgentPlatformRequestFrame,
  DesktopPlatformConnectionState,
  DesktopPlatformSession,
  DesktopPlatformSessionClose,
} from "@/shared/contracts/generated/agentWebclientBridge";
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

  /** `retryable` marks a retired logical Session that a later operation may replace. */
  constructor(
    message = "Desktop Platform Frame Port is closed",
    readonly retryable = false,
  ) {
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

/**
 * Desktop host driver: no network reconnect loop. A retired logical Session is
 * replaced once automatically, then on demand or when the surface becomes active.
 */
export class DesktopFramePortDriver extends PlatformFrameClient {
  private readonly statusListeners = new Set<StatusListener>();
  private readonly connectionWaiters = new Set<ConnectionWaiter>();
  private readonly unsubscribers: Array<() => void> = [];
  private session: DesktopPlatformSession | null = null;
  private sessionGeneration = 0;
  private status: RealtimeConnectionStatus = "connecting";
  private disposed = false;
  private closeError: DesktopFramePortClosedError | null = null;
  private canReopenSession = false;
  private closingSession = false;
  private receivedCloseEvent = false;
  // One automatic replacement per retirement; re-armed only after a Session
  // connects, so a replacement the host keeps closing cannot loop.
  private automaticReopenArmed = true;
  private automaticReopenTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly createSession: () => DesktopPlatformSession,
    requestTimeoutMs = 30_000,
  ) {
    super(requestTimeoutMs);
    this.openSession();
  }

	connect(signal?: AbortSignal): Promise<void> {
		if (this.disposed) {
			return Promise.reject(this.closeError || new DesktopFramePortClosedError());
		}
		if (signal?.aborted) {
			return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
		}
		if (this.closeError) {
			if (!this.canReopenSession || this.closingSession) return Promise.reject(this.closeError);
			try {
				this.openSession();
			} catch (error) {
				return Promise.reject(error);
			}
			// A bridge may replay a cached terminal state while listeners are installed.
			if (this.closeError) return Promise.reject(this.closeError);
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

  /** Replace a retired Session without failing; used by surface activation. */
  resume(): void {
    if (this.disposed || !this.closeError || !this.canReopenSession || this.closingSession) return;
    try {
      this.openSession();
    } catch {
      // openSession already recorded the failure as the current close state.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAutomaticReopen();
    const error = new DesktopFramePortClosedError("Desktop Platform Frame Port disposed");
    this.closeError = error;
    this.canReopenSession = false;
    this.releaseSession();
    this.handlePermanentClose(error);
    this.disposePlatformFrames(error);
    this.setStatus("disposed");
    this.statusListeners.clear();
  }

	protected sendRequestFrame(frame: AgentPlatformRequestFrame): void {
		if (this.disposed || this.closeError) {
			throw this.closeError || new DesktopFramePortClosedError();
		}
		if (this.status !== "connected" || !this.session) throw new PlatformConnectionUnavailableError();
		this.session.send(frame);
	}

  private openSession(): void {
    this.clearAutomaticReopen();
    this.releaseSession();
    this.closeError = null;
    this.canReopenSession = false;
    this.receivedCloseEvent = false;
    this.setStatus("connecting");
    if (this.disposed) throw this.closeError || new DesktopFramePortClosedError();
    const generation = this.sessionGeneration;
    let session: DesktopPlatformSession;
    try {
      session = this.createSession();
    } catch (error) {
      this.closeSession(new DesktopFramePortClosedError(
        error instanceof Error ? error.message : String(error),
        true,
      ));
      throw error;
    }
    this.session = session;
    const isCurrent = () => !this.disposed && this.sessionGeneration === generation;
    // Register close first because onState may synchronously replay a cached state.
    this.unsubscribers.push(
      session.onClose((event) => {
        if (isCurrent()) this.handleClose(event);
      }),
      session.onFrame((frame) => {
        if (isCurrent() && !this.closeError) this.dispatchPlatformFrame(frame);
      }),
      session.onState((state) => {
        if (isCurrent()) this.handleState(state);
      }),
    );
  }

  private releaseSession(): void {
    // Invalidate before cleanup: callbacks already queued by the old bridge must be ignored.
    this.sessionGeneration += 1;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    const session = this.session;
    this.session = null;
    session?.close("disposed");
  }

  private handleClose(event: DesktopPlatformSessionClose): void {
    if (this.receivedCloseEvent) return;
    this.receivedCloseEvent = true;
    this.closeSession(new DesktopFramePortClosedError(
      event.error?.message || `Desktop Platform Frame Port closed: ${event.reason}`,
      event.reason === "surface_inactive",
    ));
  }

  private closeSession(error: DesktopFramePortClosedError): void {
    this.closingSession = true;
    this.closeError = error;
    this.canReopenSession = error.retryable;
    try {
      // Fail only the old operations. A replacement Session never resends them.
      this.handlePermanentClose(error);
      this.setStatus("disconnected");
    } finally {
      this.closingSession = false;
    }
    this.scheduleAutomaticReopen();
  }

  private scheduleAutomaticReopen(): void {
    if (this.disposed || !this.canReopenSession || !this.automaticReopenArmed) return;
    this.automaticReopenArmed = false;
    const generation = this.sessionGeneration;
    // A macrotask lets rejected operations settle first; a request that already
    // replaced the Session supersedes this attempt.
    this.automaticReopenTimer = setTimeout(() => {
      this.automaticReopenTimer = null;
      if (this.sessionGeneration === generation) this.resume();
    }, 0);
  }

  private clearAutomaticReopen(): void {
    if (this.automaticReopenTimer === null) return;
    clearTimeout(this.automaticReopenTimer);
    this.automaticReopenTimer = null;
  }

  private handleState(state: DesktopPlatformConnectionState): void {
    if (this.disposed || this.closeError) return;
    const next = toRealtimeStatus(state);
    if (next === "disconnected") {
      this.closeSession(new DesktopFramePortClosedError(
        state.error?.message || "Desktop Platform Frame Port closed",
        state.retryable,
      ));
      return;
    }
    this.setStatus(next);
    if (next === "connected") {
      this.automaticReopenArmed = true;
      for (const waiter of this.connectionWaiters) waiter.resolve();
      this.connectionWaiters.clear();
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

  protected handleConnectionError(_error: Error): void {
    this.setStatus("error");
  }
}

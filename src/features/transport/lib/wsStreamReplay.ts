import { isWsConnectionFailure, type WsClient } from "@/features/transport/lib/wsClient";

export const WS_STREAM_RETRY_DELAYS_MS = [
	1_000,
	4_000,
	8_000,
	16_000,
	32_000,
] as const;

export function waitForRetryDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
	if (signal.aborted) {
		return Promise.resolve(false);
	}
	return new Promise<boolean>((resolve) => {
		let settled = false;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const finish = (shouldContinue: boolean) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			signal.removeEventListener("abort", handleAbort);
			resolve(shouldContinue);
		};
		const handleAbort = () => finish(false);
		timeoutId = setTimeout(() => finish(!signal.aborted), Math.max(0, delayMs));
		signal.addEventListener("abort", handleAbort, { once: true });
	});
}

export interface StreamReplayContext {
	/** Signal from the outer abort scope. */
	signal: AbortSignal;
	/** Retry delay array. */
	retryDelaysMs: readonly number[];
	/**
	 * Callback before each retry attempt. Returns a client ready for connect().
	 * If not provided, the retry falls through to a non-retryable error.
	 */
	getRetryClient?: (retryIndex: number) => Promise<WsClient>;
	/** Start a stream attempt with the given client. */
	startStreamAttempt: (client: WsClient) => void;
}

/**
 * Manages the retry decision for a wsClient stream error.
 *
 * Returns `true` if the error was handled (retry scheduled), `false` if the
 * error should be treated as terminal by the caller.
 *
 * The caller is expected to:
 * - Track `receivedServerActivity` (set to true on any onEvent/onFrame call).
 * - Pass a `StreamReplayContext` that includes `getRetryClient` (if retries
 *   should refresh tokens before reconnecting).
 * - Call `onNonRetryableError` (via the `StreamReplayContext`) when retries
 *   are exhausted or a non-retryable error occurs.
 */
export function handleStreamReplayError(
	error: Error,
	receivedServerActivity: boolean,
	ctx: StreamReplayContext,
	retryCount: { current: number },
	onExhausted: (finalError: Error) => void,
): boolean {
	if (error.name === "AbortError") {
		onExhausted(error);
		return true;
	}

	if (
		isWsConnectionFailure(error)
		&& !receivedServerActivity
		&& retryCount.current < ctx.retryDelaysMs.length
		&& !ctx.signal.aborted
		&& ctx.getRetryClient
	) {
		const retryIndex = retryCount.current;
		retryCount.current += 1;
		const { getRetryClient } = ctx;
		void (async () => {
			const shouldContinue = await waitForRetryDelay(
				ctx.retryDelaysMs[retryIndex],
				ctx.signal,
			);
			if (!shouldContinue || ctx.signal.aborted) {
				return;
			}
			try {
				const retryClient = await getRetryClient(retryIndex);
				if (ctx.signal.aborted) {
					return;
				}
				await retryClient.connect();
				if (ctx.signal.aborted) {
					return;
				}
				ctx.startStreamAttempt(retryClient);
			} catch (retryError) {
				const normalizedRetryError =
					retryError instanceof Error
						? retryError
						: new Error(String(retryError || "WebSocket connection failed"));
				if (isWsConnectionFailure(normalizedRetryError)) {
					const handled = handleStreamReplayError(normalizedRetryError, receivedServerActivity, ctx, retryCount, onExhausted);
					if (!handled) {
						onExhausted(normalizedRetryError);
					}
					return;
				}
				onExhausted(normalizedRetryError);
			}
		})();
		return true;
	}

	return false;
}
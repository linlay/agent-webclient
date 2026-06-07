import { waitForRetryDelay, handleStreamReplayError } from "@/features/transport/lib/wsStreamReplay";

describe("waitForRetryDelay", () => {
	it("resolves true after delay when signal is not aborted", async () => {
		jest.useFakeTimers();
		const controller = new AbortController();
		const promise = waitForRetryDelay(1000, controller.signal);

		await jest.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(result).toBe(true);
		jest.useRealTimers();
	});

	it("resolves false immediately when signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await waitForRetryDelay(1000, controller.signal);

		expect(result).toBe(false);
	});

	it("resolves false when signal is aborted during delay", async () => {
		jest.useFakeTimers();
		const controller = new AbortController();
		const promise = waitForRetryDelay(10000, controller.signal);

		controller.abort();
		const result = await promise;

		expect(result).toBe(false);
		jest.useRealTimers();
	});
});

describe("handleStreamReplayError", () => {
	it("returns true and schedules retry for connection failure before server activity", async () => {
		jest.useFakeTimers();
		const retryCount = { current: 0 };
		const signal = new AbortController().signal;
		const startStreamAttempt = jest.fn();
		const getRetryClient = jest.fn().mockResolvedValue({
			connect: jest.fn().mockResolvedValue(undefined),
		});
		const onExhausted = jest.fn();

		const error = new Error("WebSocket connection failed");
		const result = handleStreamReplayError(
			error,
			false,
			{
				signal,
				retryDelaysMs: [1000, 4000, 8000, 16000, 32000],
				getRetryClient,
				startStreamAttempt,
			},
			retryCount,
			onExhausted,
		);

		expect(result).toBe(true);
		expect(retryCount.current).toBe(1);

		// Advance past the delay to let the async retry execute
		await jest.advanceTimersByTimeAsync(1000);
		await Promise.resolve();
		await Promise.resolve();

		expect(getRetryClient).toHaveBeenCalledWith(0);
		expect(startStreamAttempt).toHaveBeenCalled();

		jest.useRealTimers();
	});

	it("returns true for AbortError and calls onExhausted", () => {
		const retryCount = { current: 0 };
		const signal = new AbortController().signal;
		const onExhausted = jest.fn();

		const error = new DOMException("The operation was aborted.", "AbortError");
		const result = handleStreamReplayError(
			error,
			false,
			{
				signal,
				retryDelaysMs: [1000],
				startStreamAttempt: jest.fn(),
			},
			retryCount,
			onExhausted,
		);

		expect(result).toBe(true);
		expect(onExhausted).toHaveBeenCalledWith(error);
	});

	it("returns false when server activity has been received", () => {
		const retryCount = { current: 0 };
		const signal = new AbortController().signal;
		const onExhausted = jest.fn();

		const error = new Error("WebSocket transport disconnected");
		const result = handleStreamReplayError(
			error,
			true,
			{
				signal,
				retryDelaysMs: [1000],
				startStreamAttempt: jest.fn(),
				getRetryClient: jest.fn(),
			},
			retryCount,
			onExhausted,
		);

		expect(result).toBe(false);
		expect(onExhausted).not.toHaveBeenCalled();
	});

	it("returns false when retries are exhausted", () => {
		const retryCount = { current: 5 };
		const signal = new AbortController().signal;
		const onExhausted = jest.fn();

		const error = new Error("WebSocket connection failed");
		const result = handleStreamReplayError(
			error,
			false,
			{
				signal,
				retryDelaysMs: [1000, 4000, 8000, 16000, 32000],
				startStreamAttempt: jest.fn(),
				getRetryClient: jest.fn(),
			},
			retryCount,
			onExhausted,
		);

		expect(result).toBe(false);
	});

	it("returns false when getRetryClient is not provided", () => {
		const retryCount = { current: 0 };
		const signal = new AbortController().signal;
		const onExhausted = jest.fn();

		const error = new Error("WebSocket connection failed");
		const result = handleStreamReplayError(
			error,
			false,
			{
				signal,
				retryDelaysMs: [1000],
				startStreamAttempt: jest.fn(),
			},
			retryCount,
			onExhausted,
		);

		expect(result).toBe(false);
	});

	it("calls onExhausted when retry throws a non-connection error", async () => {
		jest.useFakeTimers();
		const retryCount = { current: 0 };
		const controller = new AbortController();
		const startStreamAttempt = jest.fn();
		const getRetryClient = jest.fn().mockRejectedValue(new Error("Unexpected auth error"));
		const onExhausted = jest.fn();

		const error = new Error("WebSocket connection failed");
		handleStreamReplayError(
			error,
			false,
			{
				signal: controller.signal,
				retryDelaysMs: [1000],
				getRetryClient,
				startStreamAttempt,
			},
			retryCount,
			onExhausted,
		);

		await jest.advanceTimersByTimeAsync(1000);
		await Promise.resolve();
		await Promise.resolve();

		expect(onExhausted).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Unexpected auth error" }),
		);

		jest.useRealTimers();
	});
});
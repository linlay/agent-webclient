import {
	formatPlatformErrorForDisplay,
	normalizePlatformError,
} from "@/shared/data/errors/platformError";
import {
	buildI18nRuntimeConfig,
	configureI18nRuntime,
} from "@/shared/i18n";

describe("platformError", () => {
	beforeEach(() => {
		configureI18nRuntime(
			buildI18nRuntimeConfig({
				locale: "zh-CN",
				fallbackLocale: "zh-CN",
			}),
		);
	});

	it("normalizes HTTP, WS, and stream platform error payloads", () => {
		const http = normalizePlatformError({
			code: 429,
			msg: "model request failed",
			data: {
				error: {
					category: "model",
					code: "provider_quota_exhausted",
					scope: "model",
					status: 429,
					retryable: false,
					message: "model request failed with status 429",
				},
			},
		});
		const ws = normalizePlatformError({
			frame: "error",
			type: "provider_rate_limited",
			code: 429,
			msg: "rate limited",
			data: {
				error: {
					category: "model",
					code: "provider_rate_limited",
					scope: "run",
					status: 429,
					retryable: true,
					message: "too many requests",
				},
			},
		});
		const stream = normalizePlatformError({
			type: "run.error",
			payload: {
				runId: "run_1",
				error: {
					category: "chat_run",
					code: "stream_failed",
					scope: "run",
					status: 500,
					retryable: false,
					message: "stream failed",
				},
			},
		});

		expect(http).toMatchObject({
			code: "provider_quota_exhausted",
			category: "model",
			scope: "model",
			status: 429,
			retryable: false,
			message: "model request failed with status 429",
		});
		expect(ws).toMatchObject({
			code: "provider_rate_limited",
			category: "model",
			scope: "run",
			status: 429,
			retryable: true,
		});
		expect(stream).toMatchObject({
			code: "stream_failed",
			category: "chat_run",
			scope: "run",
			status: 500,
		});
	});

	it("uses code i18n as the main message and keeps technical details", () => {
		const display = formatPlatformErrorForDisplay({
			type: "run.error",
			payload: {
				error: {
					category: "model",
					code: "provider_quota_exhausted",
					scope: "model",
					status: 429,
					retryable: false,
					message: "model request failed with status 429: quota exhausted",
					diagnostics: {
						upstreamStatus: 429,
						upstreamCode: "insufficient_quota",
					},
				},
			},
		});

		expect(display.message).toBe(
			"模型服务额度已用尽，请更换模型或联系管理员检查 API Key / 额度。",
		);
		expect(display.message).not.toContain("model request failed");
		expect(display.error.message).toContain("model request failed");
		expect(display.technicalText).toContain("insufficient_quota");
	});

	it("keeps invalid request copy neutral and specializes disconnected service channels", () => {
		const invalidRequestDisplay = formatPlatformErrorForDisplay({
			error: {
				category: "request",
				code: "invalid_request",
				scope: "request",
				status: 400,
				retryable: false,
				message: "missing run id",
			},
		});
		const channelDisconnectedDisplay = formatPlatformErrorForDisplay({
			frame: "error",
			type: "invalid_request",
			code: 503,
			msg: "channel public-entry is not connected",
			data: {
				error: {
					category: "request",
					code: "invalid_request",
					scope: "request",
					status: 503,
					retryable: false,
					message: "channel public-entry is not connected",
				},
			},
		});

		expect(invalidRequestDisplay.message).toBe(
			"请求无效，服务无法处理当前请求。",
		);
		expect(invalidRequestDisplay.message).not.toContain("检查输入");
		expect(channelDisconnectedDisplay.message).toBe(
			"服务通道未连接，请检查后端通道状态。",
		);
		expect(channelDisconnectedDisplay.error.message).toBe(
			"channel public-entry is not connected",
		);
	});

	it("falls back to category and then generic text for unknown codes", () => {
		const categoryDisplay = formatPlatformErrorForDisplay({
			error: {
				category: "model",
				code: "provider_new_unknown",
				message: "very long upstream english error",
			},
		});
		const genericDisplay = formatPlatformErrorForDisplay({
			error: {
				code: "brand_new_unknown",
				message: "very long upstream english error",
			},
		});

		expect(categoryDisplay.message).toBe("模型服务请求失败，请稍后重试。");
		expect(categoryDisplay.message).not.toContain("upstream english");
		expect(genericDisplay.message).toBe("操作失败，请稍后重试。");
	});

	it("only adds retry guidance when retryable is true", () => {
		const retryable = formatPlatformErrorForDisplay({
			error: {
				category: "request",
				code: "unknown_retryable_request_error",
				retryable: true,
			},
		});
		const notRetryable = formatPlatformErrorForDisplay({
			error: {
				category: "request",
				code: "unknown_request_error",
				retryable: false,
			},
		});

		expect(retryable.message).toContain("可以稍后重试");
		expect(notRetryable.message).not.toContain("可以稍后重试");
	});
});

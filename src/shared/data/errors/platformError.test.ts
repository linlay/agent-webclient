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

 it("shows normalized rate limits and exhausted attempts without interpreting upstream text", () => {
  const payload = {code: "provider_rate_limited", category: "model", retryable: true,
   diagnostics: {attempt: 6, maxAttempts: 6, upstreamMessage: "insufficient_quota"}};
  const display = formatPlatformErrorForDisplay(payload);
  expect(display.message).toContain("触发限流");
  expect(display.message).toContain("已尝试 6 次");
  expect(display.message).not.toContain("额度已用尽");
  expect(formatPlatformErrorForDisplay({...payload, diagnostics: {attempt: 2, maxAttempts: 6}}).message).not.toContain("次数已用尽");
  expect(formatPlatformErrorForDisplay({...payload, diagnostics: {attempt: 1, maxAttempts: 1}}).message).not.toContain("次数已用尽");
 });

 it("explains structured EOF reasons and keeps legacy errors readable", () => {
  const error = {code: "provider_stream_failed", category: "model", retryable: true, message: "模型服务流式响应失败"};
  expect(formatPlatformErrorForDisplay({...error, diagnostics: {reason: "stream_ended_before_output"}}).message).toContain("返回有效输出前");
  expect(formatPlatformErrorForDisplay({...error, diagnostics: {reason: "stream_ended_before_completion"}}).message).toContain("响应尚未完成");
  expect(formatPlatformErrorForDisplay(error).message).toContain("流式响应失败");
  expect(formatPlatformErrorForDisplay({...error, diagnostics: {reason: "unknown"}}).message).toContain("流式响应失败");
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

	it("explains an uncompactable context without suggesting a provider retry", () => {
		const display = formatPlatformErrorForDisplay({ error: {
			category: "model", code: "context_window_uncompactable", retryable: false,
			message: "Context cannot be reduced below the model window",
		} });
		expect(display.message).toBe("上下文无法压缩至模型可用范围，本次运行已停止。");
		expect(display.retryHint).toBe("");
	});

	it("shows the actual message for unknown errors without opening technical details", () => {
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

		expect(categoryDisplay.message).toBe("very long upstream english error");
		expect(categoryDisplay.message).toContain("upstream english");
		expect(genericDisplay.message).toBe("very long upstream english error");
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

	it("keeps active stream errors readable after decoding a frame into an Error", () => {
		const frame = {
			frame: "error", type: "active_stream_exists", code: 409,
			msg: "detach the current run stream before starting or attaching another",
		};
		const first = formatPlatformErrorForDisplay(frame);
		const wrapped = Object.assign(new Error(first.message), { platformError: first.error, status: 409 });
		const display = formatPlatformErrorForDisplay(wrapped);
		expect(display.message).toContain("上一条运行的连接尚未释放");
		expect(display.code).toBe("active_stream_exists");
		expect(display.status).toBe(409);
		expect(display.error.message).toBe(frame.msg);
	});
});

 it("shows the occupying stream and preserves diagnostics through Error wrapping", () => {
  const diagnostics = { lane: "primary", activeStream: { runId: "run-old", requestId: "req-old", consumerId: "kanban:issue-1", state: "release_unconfirmed", lastDetachError: "detach timed out" } };
  const frame = { frame: "error", type: "active_stream_exists", code: 409, data: { error: { code: "active_stream_exists", status: 409, retryable: false, diagnostics } } };
  const initial = formatPlatformErrorForDisplay(frame);
  const display = formatPlatformErrorForDisplay(Object.assign(new Error(initial.message), { platformError: initial.error }));
  for (const value of ["primary", "run-old", "req-old", "kanban:issue-1"]) expect(display.message).toContain(value);
  expect(display.message).not.toContain("稍后重试");
  expect(display.technicalText).toContain("detach timed out");
  expect(display.error.diagnostics).toEqual(diagnostics);
 });
 it("identifies a reservation without inventing a Run or consumer", () => {
  const display = formatPlatformErrorForDisplay({ data: { error: { code: "active_stream_exists", diagnostics: { lane: "main", activeStream: { requestId: "pending-1", runId: "" } } } } });
  expect(display.message).toContain("pending-1");
  expect(display.message).toContain("尚未取得 Run ID");
  expect(display.message).toContain("未能关联");
 });

it("preserves a structured skillId without parsing the error message", () => {
  expect(normalizePlatformError({ data: { error: { code: "must_use_skill_unavailable", message: "Unavailable", skillId: "office/pdf" } } }).skillId).toBe("office/pdf");
});

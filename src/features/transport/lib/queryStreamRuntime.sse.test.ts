import {
  ApiError,
  createAttachStream,
  createQueryStream,
} from "@/shared/api/apiClient";
import {
  executeAttachRunSse,
  executeQueryStreamSse,
} from "@/features/transport/lib/queryStreamRuntime.sse";

jest.mock("@/shared/api/apiClient", () => {
  const actual = jest.requireActual("@/shared/api/apiClient");
  return {
    ...actual,
    createAttachStream: jest.fn(),
    createQueryStream: jest.fn(),
  };
});

function createSseResponse(chunks: string[], status = 200): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    },
  );
}

describe("executeQueryStreamSse", () => {
  const createQueryStreamMock =
    createQueryStream as jest.MockedFunction<typeof createQueryStream>;
  const createAttachStreamMock =
    createAttachStream as jest.MockedFunction<typeof createAttachStream>;

  beforeEach(() => {
    createQueryStreamMock.mockReset();
    createAttachStreamMock.mockReset();
  });

  it("dispatches lifecycle actions and forwards parsed events", async () => {
    const dispatch = jest.fn();
    const handleEvent = jest.fn();
    createQueryStreamMock.mockResolvedValue(
      createSseResponse([
        'data: {"type":"content.delta","text":"hi"}\n\n',
        'data: {"type":"run.complete","runId":"run_1"}\n\n',
      ]),
    );

    await executeQueryStreamSse({
      params: {
        requestId: "req_sse_1",
        message: "hello",
      },
      dispatch,
      handleEvent,
    });

    expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual([
      "SET_REQUEST_ID",
      "SET_STREAMING",
      "SET_ABORT_CONTROLLER",
      "SET_STREAMING",
      "SET_ABORT_CONTROLLER",
    ]);
    expect(handleEvent).toHaveBeenNthCalledWith(1, {
      type: "content.delta",
      text: "hi",
    });
    expect(handleEvent).toHaveBeenNthCalledWith(2, {
      type: "run.complete",
      runId: "run_1",
    });
  });

  it("stops cleanly when the external signal aborts", async () => {
    const dispatch = jest.fn();
    const handleEvent = jest.fn();
    const externalController = new AbortController();

    createQueryStreamMock.mockImplementation(async ({ signal }) => {
      externalController.abort();
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      return createSseResponse([]);
    });

    await executeQueryStreamSse({
      params: {
        requestId: "req_abort",
        message: "hello",
        signal: externalController.signal,
      },
      dispatch,
      handleEvent,
    });

    expect(handleEvent).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_STREAMING",
      streaming: false,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ABORT_CONTROLLER",
      controller: null,
    });
  });

  it("throws ApiError for non-ok responses", async () => {
    createQueryStreamMock.mockResolvedValue(
      new Response(JSON.stringify({
        code: 429,
        msg: "model request failed with status 429",
        data: {
          error: {
            category: "model",
            code: "provider_quota_exhausted",
            scope: "model",
            status: 429,
            retryable: false,
            message: "model request failed with status 429: quota exhausted",
            diagnostics: { upstreamStatus: 429 },
          },
        },
      }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      executeQueryStreamSse({
        params: {
          requestId: "req_error",
          message: "hello",
        },
        dispatch: jest.fn(),
        handleEvent: jest.fn(),
      }),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        message: "模型服务额度已用尽，请更换模型或联系管理员检查 API Key / 额度。",
        status: 429,
        platformError: expect.objectContaining({
          code: "provider_quota_exhausted",
          message: "model request failed with status 429: quota exhausted",
        }),
      }),
    );
  });

  it("appends a debug line when an sse event cannot be parsed", async () => {
    const dispatch = jest.fn();
    createQueryStreamMock.mockResolvedValue(
      createSseResponse(['data: {"type":"content.delta"\n\n']),
    );

    await executeQueryStreamSse({
      params: {
        requestId: "req_bad_frame",
        message: "hello",
      },
      dispatch,
      handleEvent: jest.fn(),
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "APPEND_DEBUG",
        line: expect.stringContaining("[sse] Failed to parse event:"),
      }),
    );
  });

  it("attaches to a run with runId and lastSeq and forwards parsed events", async () => {
    const dispatch = jest.fn();
    const handleEvent = jest.fn();
    createAttachStreamMock.mockResolvedValue(
      createSseResponse([
        'event: message\ndata: {"type":"content.delta","text":"hi","runId":"run_1"}\n\n',
        'data: {"type":"run.complete","runId":"run_1"}\n\n',
      ]),
    );

    await executeAttachRunSse({
      params: {
        runId: "run_1",
        lastSeq: 7,
      },
      dispatch,
      handleEvent,
    });

    expect(createAttachStreamMock).toHaveBeenCalledWith({
      runId: "run_1",
      lastSeq: 7,
      signal: expect.any(AbortSignal),
    });
    expect(handleEvent).toHaveBeenNthCalledWith(1, {
      type: "content.delta",
      text: "hi",
      runId: "run_1",
    });
    expect(handleEvent).toHaveBeenNthCalledWith(2, {
      type: "run.complete",
      runId: "run_1",
    });
  });

  it("treats attach [DONE] as normal completion", async () => {
    const handleEvent = jest.fn();
    createAttachStreamMock.mockResolvedValue(
      createSseResponse(['data: {"type":"content.delta","text":"hi"}\n\n', "data: [DONE]\n\n"]),
    );

    await executeAttachRunSse({
      params: {
        runId: "run_done",
      },
      dispatch: jest.fn(),
      handleEvent,
    });

    expect(handleEvent).toHaveBeenCalledTimes(1);
    expect(handleEvent).toHaveBeenCalledWith({
      type: "content.delta",
      text: "hi",
    });
  });

  it("throws ApiError for expired attach sequence windows", async () => {
    createAttachStreamMock.mockResolvedValue(
      new Response(JSON.stringify({ msg: "sequence expired", code: "SEQ_EXPIRED" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      executeAttachRunSse({
        params: {
          runId: "run_expired",
          lastSeq: 99,
        },
        dispatch: jest.fn(),
        handleEvent: jest.fn(),
      }),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        message: "操作失败，请稍后重试。",
        status: 409,
        code: "SEQ_EXPIRED",
        platformError: expect.objectContaining({
          code: "SEQ_EXPIRED",
          message: "HTTP 409",
        }),
      }),
    );
  });
});

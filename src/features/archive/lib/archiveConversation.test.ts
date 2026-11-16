import { buildArchiveConversationData } from "@/features/archive/lib/archiveConversation";

const EPOCH = 1_710_000_000_000;

const archivedEvents = [
  { type: "request.query", chatId: "chat_1", requestId: "req_1", message: "帮我总结这次改动", timestamp: EPOCH },
  { type: "run.start", chatId: "chat_1", runId: "run_1", timestamp: EPOCH + 1 },
  {
    type: "tool.snapshot", chatId: "chat_1", runId: "run_1", toolId: "tool_1",
    toolName: "file_read", arguments: '{"filePath":"src/App.tsx"}', timestamp: EPOCH + 2,
  },
  {
    type: "tool.result", chatId: "chat_1", runId: "run_1", toolId: "tool_1",
    toolName: "file_read", result: "export const App = App;", timestamp: EPOCH + 3,
  },
  {
    type: "content.snapshot", chatId: "chat_1", runId: "run_1",
    contentId: "content_1", text: "改动只有一处。", timestamp: EPOCH + 4,
  },
  { type: "run.complete", chatId: "chat_1", runId: "run_1", timestamp: EPOCH + 5 },
];

describe("buildArchiveConversationData", () => {
  it("replays archived events into the same projection the conversation timeline uses", () => {
    const data = buildArchiveConversationData({ chatId: "chat_1", events: archivedEvents });

    expect(data).not.toBeNull();
    expect(data?.chatId).toBe("chat_1");
    expect(data?.hasActiveRun).toBe(false);
    expect(data?.capturedAt).toBeUndefined();
    expect(data?.tasks).toBeInstanceOf(Map);
    expect(data?.nodes.map((node) => node.kind)).toEqual([
      "message",
      "tool",
      "content",
    ]);
    expect(data?.nodes[0]).toEqual(expect.objectContaining({
      role: "user",
      text: "帮我总结这次改动",
    }));
    expect(data?.nodes[2]).toEqual(expect.objectContaining({
      kind: "content",
      text: "改动只有一处。",
    }));
    expect(data?.terminals).toEqual([
      expect.objectContaining({ type: "run.complete", runId: "run_1" }),
    ]);
  });

  it("drops the transient model-retry placeholder", () => {
    const data = buildArchiveConversationData({
      chatId: "chat_1",
      events: [
        ...archivedEvents,
        {
          type: "run.activity", chatId: "chat_1", runId: "run_1", timestamp: EPOCH + 6,
          retry: { attempt: 2, maxAttempts: 3, delayMs: 1_000, reason: "model_stream_idle_timeout" },
        },
      ],
    });

    expect(data?.nodes.some((node) => node.id.startsWith("model_retry_"))).toBe(false);
  });

  it("ignores events that belong to another chat instead of leaking their body", () => {
    const data = buildArchiveConversationData({
      chatId: "chat_1",
      events: [
        ...archivedEvents,
        {
          type: "content.snapshot", chatId: "chat_2",
          contentId: "foreign", text: "must not leak", timestamp: EPOCH + 7,
        },
      ],
    });

    expect(data?.nodes.some((node) => node.text?.includes("must not leak"))).toBe(false);
  });

  it("renders legacy archives that only kept the summarized runs payload", () => {
    const data = buildArchiveConversationData({
      chatId: "chat_legacy",
      updatedAt: EPOCH,
      runs: [{
        runId: "run_1",
        startedAt: EPOCH - 5_000,
        finishedAt: EPOCH,
        initialMessage: "安排两天行程",
        assistantText: "第一天沿湖散步。",
      }],
    });

    expect(data?.nodes).toEqual([
      expect.objectContaining({ kind: "message", role: "user", text: "安排两天行程", ts: EPOCH - 5_000 }),
      expect.objectContaining({ kind: "content", text: "第一天沿湖散步。", status: "completed", ts: EPOCH }),
    ]);
    expect(data?.terminals).toEqual([]);
  });

  it("keeps legacy run timing unknown instead of inventing a clock", () => {
    const data = buildArchiveConversationData({
      chatId: "chat_legacy",
      updatedAt: EPOCH,
      runs: [{ initialMessage: "安排两天行程", assistantText: "第一天沿湖散步。" }],
    });

    expect(data?.nodes.map((node) => node.ts)).toEqual([0, 0]);
  });

  it.each([
    ["no detail", null],
    ["no chat id", { chatId: "", events: archivedEvents }],
    ["no events and no runs", { chatId: "chat_1", events: [] }],
    ["untimestamped events without runs", { chatId: "chat_1", events: [{ type: "content.snapshot", contentId: "c", text: "no time" }] }],
    ["runs without readable text", { chatId: "chat_1", runs: [{ runId: "run_1" }] }],
  ])("returns null when the archive has nothing to render (%s)", (_label, detail) => {
    expect(buildArchiveConversationData(detail)).toBeNull();
  });
});
import { buildChatReplayProjection } from "@/features/conversation/lib/chatReplayProjection";

const EPOCH = 1_710_000_000_000;

describe("buildChatReplayProjection", () => {
  it("builds the standalone surface projection from the canonical chat replay", () => {
    const replay = buildChatReplayProjection("chat_1", {
      events: [
        {
          type: "planning.start",
          chatId: "chat_1",
          runId: "run_1",
          planningId: "planning_1",
          planningLabel: "Plan",
          text: "First",
          timestamp: EPOCH,
        },
        {
          type: "planning.end",
          chatId: "chat_1",
          runId: "run_1",
          planningId: "planning_1",
          text: "First step",
          timestamp: EPOCH + 1,
        },
        {
          type: "plan.update",
          chatId: "chat_1",
          runId: "run_1",
          planId: "plan_1",
          plan: [{ taskId: "task_1", description: "event task" }],
          timestamp: EPOCH + 2,
        },
        {
          type: "task.start",
          chatId: "chat_1",
          runId: "run_1",
          taskId: "task_1",
          timestamp: EPOCH + 3,
        },
        {
          type: "tool.snapshot",
          chatId: "chat_1",
          runId: "run_1",
          toolId: "tool_edit",
          toolName: "file_edit",
          arguments: '{"file_path":"/workspace/src/App.tsx"}',
          timestamp: EPOCH + 4,
        },
        {
          type: "tool.result",
          chatId: "chat_1",
          runId: "run_1",
          toolId: "tool_edit",
          result: JSON.stringify({
            status: "edited",
            filePath: "/workspace/src/App.tsx",
            lineStats: { addedLines: 8, deletedLines: 2, editedLines: 2 },
          }),
          timestamp: EPOCH + 5,
        },
        {
          type: "source.publish",
          chatId: "chat_1",
          runId: "run_1",
          publishId: "publish_1",
          kind: "kbase",
          sourceCount: 1,
          chunkCount: 1,
          sources: [{
            id: "source_1",
            name: "guide.md",
            chunks: [{ chunkId: "chunk_1", index: 1, content: "Answer" }],
          }],
          timestamp: EPOCH + 6,
        },
        {
          type: "artifact.publish",
          chatId: "chat_1",
          runId: "run_1",
          artifacts: [{
            artifactId: "artifact_event",
            type: "file",
            name: "event.txt",
            mimeType: "text/plain",
            url: "artifacts/run_1/event.txt",
          }],
          timestamp: EPOCH + 7,
        },
        {
          type: "content.snapshot",
          chatId: "another_chat",
          contentId: "foreign",
          text: "must not leak",
          timestamp: EPOCH + 8,
        },
        {
          type: "content.snapshot",
          chatId: "chat_1",
          contentId: "invalid_time",
          text: "ignored",
          timestamp: "not-an-epoch",
        },
      ],
      artifact: {
        items: [{
          artifactId: "artifact_snapshot",
          name: "snapshot.txt",
          mimeType: "text/plain",
          sizeBytes: 12,
          url: "artifacts/run_1/snapshot.txt",
          timestamp: EPOCH + 9,
        }],
      },
      plan: {
        planId: "plan_1",
        tasks: [{ taskId: "task_1", description: "snapshot task" }],
      },
      awaiting: null,
    });

    expect(replay.rawEventCount).toBe(10);
    expect(replay.events).toHaveLength(9);
    expect(replay.state.chatId).toBe("chat_1");
    expect(replay.state.events.every((event) => event.chatId !== "another_chat")).toBe(true);
    expect(replay.state.artifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact_snapshot",
        artifact: expect.objectContaining({
          name: "snapshot.txt",
          url: "artifacts/run_1/snapshot.txt",
        }),
      }),
    ]);
    expect(replay.state.fileChanges).toEqual([
      expect.objectContaining({
        runId: "run_1",
        filePath: "/workspace/src/App.tsx",
        addedLines: 8,
        deletedLines: 2,
      }),
    ]);
    expect(replay.state.plan).toEqual({
      planId: "plan_1",
      plan: [{ taskId: "task_1", description: "snapshot task" }],
    });
    expect(replay.state.planRuntimeByTaskId.get("task_1")?.status).toBe("running");
    expect(Array.from(replay.state.timelineNodes.values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "planning", planningId: "planning_1" }),
        expect.objectContaining({
          kind: "source",
          sourcePublishId: "publish_1",
          sources: [expect.objectContaining({ id: "source_1" })],
        }),
      ]),
    );
    expect(replay.state.debugEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "planning.snapshot",
        "tool.snapshot",
        "tool.result",
        "source.publish",
        "artifact.publish",
      ]),
    );
    expect(replay.awaitingReconciliation).toEqual({ matched: false, diagnostic: "" });
  });
});

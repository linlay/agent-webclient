import { parseConversationSnapshotV1 } from "./conversationSnapshotV1";

const EPOCH = 1_800_000_000_000;

function buildTurn(runId: string, count: number) {
  return {
    runId,
    queryAt: EPOCH,
    startedAt: EPOCH,
    outcome: "completed",
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `${runId}-node-${index}`,
      kind: "message",
      role: "assistant",
      text: "ok",
      at: EPOCH,
      runId,
    })),
  };
}

function buildSnapshot(turns: ReturnType<typeof buildTurn>[]) {
  return {
    version: 1,
    title: "Conversation",
    locale: "zh-CN",
    createdAt: EPOCH,
    capturedAt: EPOCH,
    turns,
    attachments: [],
  };
}

describe("parseConversationSnapshotV1 node limits", () => {
  it("accepts more than 2000 nodes when every turn stays within the limit", () => {
    const parsed = parseConversationSnapshotV1(
      JSON.stringify(
        buildSnapshot([buildTurn("run-1", 1_001), buildTurn("run-2", 1_001)]),
      ),
    );

    expect(parsed?.turns).toHaveLength(2);
    expect(parsed?.turns[0].nodes).toHaveLength(1_001);
    expect(parsed?.turns[1].nodes).toHaveLength(1_001);
  });

  it("rejects a turn containing more than 2000 nodes", () => {
    expect(
      parseConversationSnapshotV1(
        JSON.stringify(buildSnapshot([buildTurn("run-1", 2_001)])),
      ),
    ).toBeNull();
  });

  it("still rejects duplicate node ids across turns", () => {
    const first = buildTurn("run-1", 1);
    const second = buildTurn("run-2", 1);
    second.nodes[0].id = first.nodes[0].id;

    expect(
      parseConversationSnapshotV1(
        JSON.stringify(buildSnapshot([first, second])),
      ),
    ).toBeNull();
  });

  it("still rejects snapshots larger than 20 MiB", () => {
    expect(
      parseConversationSnapshotV1(
        JSON.stringify({
          ...buildSnapshot([buildTurn("run-1", 1)]),
          padding: "x".repeat(20 * 1024 * 1024),
        }),
      ),
    ).toBeNull();
  });
});

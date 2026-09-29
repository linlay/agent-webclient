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

describe("parseConversationSnapshotV1 attachments", () => {
  const resource = {
    id: "0123456789abcdef01234567",
    name: "report.pdf",
    mimeType: "application/pdf",
    size: 42,
    sha256: "a".repeat(64),
    sourceRef: "artifacts/run-1/report.pdf",
  };

  it("accepts non-HTML resources from the canonical artifact directory", () => {
    const parsed = parseConversationSnapshotV1(
      JSON.stringify({
        ...buildSnapshot([buildTurn("run-1", 1)]),
        attachments: [resource],
      }),
    );
    expect(parsed?.attachments).toEqual([{
      id: resource.id, name: resource.name, mimeType: resource.mimeType, sourceRef: resource.sourceRef,
    }]);
  });

  it("does not own resource-scope policy", () => {
    const sourceRef = "future-resource-scheme/report.pdf";
    const parsed = parseConversationSnapshotV1(
      JSON.stringify({
        ...buildSnapshot([buildTurn("run-1", 1)]),
        attachments: [{ ...resource, sourceRef }],
      }),
    );
    expect(parsed?.attachments[0]?.sourceRef).toBe(sourceRef);
  });

  it("keeps the first valid resource and omits invalid optional metadata", () => {
    const parsed = parseConversationSnapshotV1(JSON.stringify({
      ...buildSnapshot([buildTurn("run-1", 1)]),
      attachments: [
        { ...resource, mimeType: "Text/HTML; Charset=UTF-8", size: undefined, sha256: undefined },
        { ...resource, sourceRef: "artifacts/run-2/report.pdf" },
        { ...resource, id: "abcdef0123456789abcdef01", name: "", sourceRef: "bad" },
      ],
    }));
    expect(parsed?.attachments).toEqual([{
      id: resource.id, name: resource.name, mimeType: "text/html", sourceRef: resource.sourceRef,
    }]);
    expect(parsed?.turns).toHaveLength(1);
  });
});

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

  it("accepts historical snapshots above the former byte limit", () => {
    const parsed = parseConversationSnapshotV1(JSON.stringify({
      ...buildSnapshot([buildTurn("run-1", 1)]), padding: "x".repeat(20 * 1024 * 1024),
    }));
    expect(parsed !== null).toBe(true);
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
      ...resource,
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

  it("rejects conflicting resource identities instead of dropping invalid relationships", () => {
    const parsed = parseConversationSnapshotV1(JSON.stringify({
      ...buildSnapshot([buildTurn("run-1", 1)]),
      attachments: [
        { ...resource, mimeType: "Text/HTML; Charset=UTF-8", size: undefined, sha256: undefined },
        { ...resource, sourceRef: "artifacts/run-2/report.pdf" },
        { ...resource, id: "abcdef0123456789abcdef01", name: "", sourceRef: "bad" },
      ],
    }));
    expect(parsed).toBeNull();
  });
});

it("preserves the resource graph and projects only supported safe display fields", () => {
  const image = { id: "1".repeat(24), name: "query.png", sourceRef: "query.png", mimeType: "image/png", size: 2, sha256: "a".repeat(64) };
  const omitted = { id: "2".repeat(24), name: "missing.png", sourceRef: "missing.png", reason: "not_found" };
  const html = { id: "3".repeat(24), name: "report.html", sourceRef: "artifacts/run-1/report.html", mimeType: "text/html", mediaRefs: { "@chat/query.png": image.id, "missing.png": omitted.id } };
  const turn = buildTurn("run-1", 1);
  const input = { ...buildSnapshot([turn]), attachments: [image, html], omittedResources: [omitted] };
  Object.assign(turn.nodes[0], { attachmentIds: [image.id, omitted.id], steerId: "steer-1", origin: { type: "user", raw: { token: "secret" } }, view: { html: "unsafe" }, attachments: [{ meta: { token: "secret" } }] });
  const snapshot = parseConversationSnapshotV1(JSON.stringify(input));
  expect(snapshot?.attachments).toEqual([image, html]);
  expect(snapshot?.omittedResources).toEqual([omitted]);
  expect(snapshot?.turns[0].nodes[0]).not.toHaveProperty("view");
  expect(snapshot?.turns[0].nodes[0]).not.toHaveProperty("attachments");
  expect(snapshot?.turns[0].nodes[0].origin).toEqual({ type: "user" });
  for (const mutation of [
    () => { html.mediaRefs["missing.png"] = "f".repeat(24); },
    () => { html.mediaRefs["missing.png"] = html.id; },
    () => { input.omittedResources[0].id = image.id; },
  ]) {
    mutation();
    expect(parseConversationSnapshotV1(JSON.stringify(input))).toBeNull();
  }
});

it.each(["/absolute.png", "../escape.png", "x/%252e%252e/file.png", "C%3A/file.png", "x/%2F/file.png", ".tools/data.png", "https://example.test/i.png"])("rejects invalid resource reference %s", (sourceRef) => {
  expect(parseConversationSnapshotV1(JSON.stringify({ ...buildSnapshot([buildTurn("run-1", 1)]), attachments: [{ id: "1".repeat(24), name: "x", mimeType: "image/png", sourceRef }] }))).toBeNull();
});

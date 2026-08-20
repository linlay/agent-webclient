import {
  MAX_CONVERSATION_SNAPSHOT_BYTES,
  parseConversationSnapshot,
} from "./conversationSnapshot";

const EPOCH = 1_700_000_000_000;

function snapshot(): Record<string, unknown> {
  return {
    version: 1,
    title: "Release plan",
    createdAt: EPOCH,
    capturedAt: EPOCH + 2_000,
    turns: [
      {
        startedAt: EPOCH + 100,
        endedAt: EPOCH + 1_000,
        outcome: "completed",
        items: [
          { kind: "user", text: "Ship it", at: EPOCH + 100 },
          { kind: "reasoning", text: "Check", label: "验证", at: EPOCH + 500 },
          { kind: "assistant", text: "Ready", at: EPOCH + 900 },
        ],
      },
    ],
  };
}

describe("conversationSnapshot", () => {
  it("parses the exact V1 contract", () => {
    expect(parseConversationSnapshot(JSON.stringify(snapshot()))).toEqual(snapshot());
  });

  it("accepts a running root turn without endedAt", () => {
    const value = snapshot();
    value.turns = [{
      startedAt: EPOCH + 100,
      outcome: "running",
      items: [{ kind: "user", text: "Continue", at: EPOCH + 100 }],
    }];
    expect(parseConversationSnapshot(JSON.stringify(value))).not.toBeNull();
  });

  it("accepts authoritative run.start on either side of the query timestamp", () => {
    for (const [startedAt, queryAt] of [
      [EPOCH + 100, EPOCH + 101],
      [EPOCH + 101, EPOCH + 100],
    ]) {
      const value = snapshot();
      value.turns = [{
        startedAt,
        endedAt: EPOCH + 300,
        outcome: "completed",
        items: [
          { kind: "user", text: "Question", at: queryAt },
          { kind: "assistant", text: "Answer", at: EPOCH + 200 },
        ],
      }];
      expect(parseConversationSnapshot(JSON.stringify(value))).not.toBeNull();
    }
  });

  it("rejects assistant content before either the query or run start", () => {
    const value = snapshot();
    value.turns = [{
      startedAt: EPOCH + 101,
      endedAt: EPOCH + 300,
      outcome: "completed",
      items: [
        { kind: "user", text: "Question", at: EPOCH + 100 },
        { kind: "assistant", text: "Answer", at: EPOCH + 100 },
      ],
    }];
    expect(parseConversationSnapshot(JSON.stringify(value))).toBeNull();
  });

  it("rejects unknown fields, invalid outcomes, item order, and terminal turns without endedAt", () => {
    const cases = [snapshot(), snapshot(), snapshot(), snapshot()];
    cases[0].private = "secret";
    (cases[1].turns as Array<Record<string, unknown>>)[0].outcome = "unknown";
    ((cases[2].turns as Array<Record<string, unknown>>)[0].items as Array<Record<string, unknown>>)[2].at = EPOCH + 200;
    delete (cases[3].turns as Array<Record<string, unknown>>)[0].endedAt;
    for (const value of cases) {
      expect(parseConversationSnapshot(JSON.stringify(value))).toBeNull();
    }
  });

  it("rejects an oversized JSON document", () => {
    expect(parseConversationSnapshot(" ".repeat(MAX_CONVERSATION_SNAPSHOT_BYTES + 1))).toBeNull();
  });

  it("accepts a document at the 20 MiB boundary and rejects one byte more", () => {
    const exact = snapshot();
    exact.turns = [{
      startedAt: EPOCH + 100,
      outcome: "running",
      items: [{ kind: "user", text: "", at: EPOCH + 100 }],
    }];
    const emptyTextBytes = JSON.stringify(exact).length;
    const text = "x".repeat(MAX_CONVERSATION_SNAPSHOT_BYTES - emptyTextBytes);
    (exact.turns as Array<Record<string, unknown>>)[0].items = [
      { kind: "user", text, at: EPOCH + 100 },
    ];
    const encoded = JSON.stringify(exact);

    expect(new TextEncoder().encode(encoded)).toHaveLength(MAX_CONVERSATION_SNAPSHOT_BYTES);
    expect(parseConversationSnapshot(encoded)).not.toBeNull();
    expect(parseConversationSnapshot(`${encoded} `)).toBeNull();
  });

  it("allows a large item within the document limit", () => {
    const value = snapshot();
    (value.turns as Array<Record<string, unknown>>)[0].items = [
      { kind: "user", text: "x".repeat(201 * 1024), at: EPOCH + 100 },
    ];
    expect(parseConversationSnapshot(JSON.stringify(value))).not.toBeNull();
  });

  it("enforces the 2000 item rendering guard", () => {
    const value = snapshot();
    const items = [
      { kind: "user", text: "question", at: EPOCH + 100 },
      ...Array.from({ length: 1_999 }, (_, index) => ({
        kind: "assistant",
        text: "answer",
        at: EPOCH + 101 + index,
      })),
    ];
    value.turns = [{
      startedAt: EPOCH + 100,
      outcome: "running",
      items,
    }];
    expect(parseConversationSnapshot(JSON.stringify(value))).not.toBeNull();
    items.push({ kind: "assistant", text: "too many", at: EPOCH + 2_101 });
    expect(parseConversationSnapshot(JSON.stringify(value))).toBeNull();
  });
});

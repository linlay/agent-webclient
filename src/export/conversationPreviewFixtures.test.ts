import { parseConversationSnapshotV1, snapshotV1PreviewData } from "./conversationSnapshotV1";

const fixtures = require("../../qa/conversation-export-fixtures.cjs") as Record<string, unknown>;

describe("conversation export preview fixtures", () => {
  it("keeps every preview case within the production snapshot contract", () => {
    const parsed = parseConversationSnapshotV1(JSON.stringify(fixtures.example));
    expect(parsed).not.toBeNull();
    expect(snapshotV1PreviewData(parsed!).nodes.map((node) => node.kind))
      .toEqual(["message", "thinking", "tool", "content"]);
    expect(snapshotV1PreviewData(parsed!).terminals[0].timestamp).toBe(1_700_000_457_000);
  });

  it("restores built-in labels in legacy Chinese snapshots without replacing explicit labels", () => {
    const parsed = parseConversationSnapshotV1(JSON.stringify(fixtures.example));
    expect(parsed).not.toBeNull();
    const snapshot = structuredClone(parsed!);
    const tool = snapshot.turns[0].nodes.find((node) => node.kind === "tool")!;
    tool.toolName = "file_read";
    tool.toolLabel = undefined;
    expect(snapshotV1PreviewData(snapshot).nodes.find((node) => node.kind === "tool")?.toolLabel)
      .toBe("读取文件");

    tool.toolLabel = "自定义读取";
    expect(snapshotV1PreviewData(snapshot).nodes.find((node) => node.kind === "tool")?.toolLabel)
      .toBe("自定义读取");

    tool.toolLabel = undefined;
    tool.toolName = "third_party_tool";
    expect(snapshotV1PreviewData(snapshot).nodes.find((node) => node.kind === "tool")?.toolName)
      .toBe("third_party_tool");

    tool.toolName = "__proto__";
    expect(snapshotV1PreviewData(snapshot).nodes.find((node) => node.kind === "tool")?.toolLabel)
      .toBeUndefined();

    snapshot.locale = "en-US";
    tool.toolName = "file_read";
    expect(snapshotV1PreviewData(snapshot).nodes.find((node) => node.kind === "tool")?.toolLabel)
      .toBeUndefined();
  });
});

import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import type { TimelineDisplayItem } from "@/features/timeline/lib/timelineDisplay";
import {
  buildNodeCollapseTargets,
  buildNodeVirtualIndexMap,
  buildTextSearchMatches,
  getNodeSearchableText,
  isSearchableTextNode,
} from "@/features/timeline/lib/timelineTextSearch";

function createNode(
  partial: Partial<TimelineNode> & Pick<TimelineNode, "id" | "kind" | "ts">,
): TimelineNode {
  return { ...partial } as TimelineNode;
}

describe("isSearchableTextNode", () => {
  it("matches content and user message nodes only", () => {
    expect(
      isSearchableTextNode(createNode({ id: "c1", kind: "content", ts: 1 })),
    ).toBe(true);
    expect(
      isSearchableTextNode(
        createNode({ id: "u1", kind: "message", role: "user", ts: 1 }),
      ),
    ).toBe(true);
    expect(
      isSearchableTextNode(
        createNode({ id: "s1", kind: "message", role: "system", ts: 1 }),
      ),
    ).toBe(false);
    expect(
      isSearchableTextNode(createNode({ id: "t1", kind: "thinking", ts: 1 })),
    ).toBe(false);
    expect(
      isSearchableTextNode(createNode({ id: "tool1", kind: "tool", ts: 1 })),
    ).toBe(false);
  });
});

describe("getNodeSearchableText", () => {
  it("strips voice fences from content text", () => {
    const text = getNodeSearchableText(
      createNode({
        id: "c1",
        kind: "content",
        text: "before\n```tts-voice\naudio\n```\nafter",
        ts: 1,
      }),
    );
    expect(text).toBe("before\n\nafter");
  });

  it("strips inline markdown syntax from content text", () => {
    const text = getNodeSearchableText(
      createNode({
        id: "c1",
        kind: "content",
        text: "这是**加粗**的文字，还有[链接](https://example.com)",
        ts: 1,
      }),
    );
    expect(text).toBe("这是加粗的文字，还有链接");
  });

  it("returns user message text as-is", () => {
    const text = getNodeSearchableText(
      createNode({ id: "u1", kind: "message", role: "user", text: "hi", ts: 1 }),
    );
    expect(text).toBe("hi");
  });
});

describe("buildTextSearchMatches", () => {
  it("counts case-insensitively across searchable nodes in order", () => {
    const nodes: TimelineNode[] = [
      createNode({ id: "u1", kind: "message", role: "user", text: "Hello World", ts: 1 }),
      createNode({ id: "c1", kind: "content", text: "hello again hello", ts: 2 }),
      createNode({ id: "t1", kind: "thinking", text: "hello", ts: 3 }),
    ];

    const { matches, total } = buildTextSearchMatches(nodes, "hello");

    expect(total).toBe(3);
    expect(matches[0]).toMatchObject({ nodeId: "u1", ordinalInNode: 1 });
    expect(matches[1]).toMatchObject({ nodeId: "c1", ordinalInNode: 1 });
    expect(matches[2]).toMatchObject({ nodeId: "c1", ordinalInNode: 2 });
  });

  it("matches text spanning inline markdown boundaries", () => {
    const nodes: TimelineNode[] = [
      createNode({ id: "c1", kind: "content", text: "这是**加粗**文字", ts: 1 }),
    ];

    const { matches, total } = buildTextSearchMatches(nodes, "加粗文字");

    expect(total).toBe(1);
    expect(matches[0]).toMatchObject({ nodeId: "c1", ordinalInNode: 1 });
  });

  it("returns zero matches for a blank query", () => {
    const nodes: TimelineNode[] = [
      createNode({ id: "c1", kind: "content", text: "hello", ts: 1 }),
    ];
    expect(buildTextSearchMatches(nodes, "   ").total).toBe(0);
  });
});

describe("buildNodeVirtualIndexMap", () => {
  it("maps query and run nodes to their virtual item index", () => {
    const nodes: TimelineNode[] = [
      createNode({ id: "u1", kind: "message", role: "user", text: "hi", ts: 1 }),
      createNode({ id: "c1", kind: "content", text: "answer", ts: 2 }),
      createNode({ id: "c2", kind: "content", text: "answer2", ts: 3 }),
    ];
    const displayItems: TimelineDisplayItem[] = [
      { kind: "query", key: "q1", node: nodes[0] },
      {
        kind: "run",
        key: "r1",
        queryNode: nodes[0],
        nodes: [nodes[1], nodes[2]],
        renderEntries: [
          { kind: "node", key: "n1", node: nodes[1] },
          { kind: "node", key: "n2", node: nodes[2] },
        ],
      },
    ];

    const map = buildNodeVirtualIndexMap(displayItems);

    expect(map.get("u1")).toBe(0);
    expect(map.get("c1")).toBe(1);
    expect(map.get("c2")).toBe(1);
  });

  it("maps standalone nodes nested inside a task group", () => {
    const node = createNode({
      id: "c1",
      kind: "content",
      text: "answer",
      ts: 2,
    });
    const displayItems: TimelineDisplayItem[] = [
      {
        kind: "standalone",
        key: "s1",
        renderEntry: {
          kind: "task-group",
          key: "tg1",
          taskId: "t1",
          taskName: "Task",
          status: "done",
          durationMs: 0,
          error: "",
          nodes: [node],
          renderEntries: [{ kind: "node", key: "n1", node }],
        },
      },
    ];

    const map = buildNodeVirtualIndexMap(displayItems);

    expect(map.get("c1")).toBe(0);
  });
});

describe("buildNodeCollapseTargets", () => {
  it("maps run nodes to their run collapse key", () => {
    const content = createNode({
      id: "c1",
      kind: "content",
      text: "answer",
      ts: 2,
    });
    const displayItems: TimelineDisplayItem[] = [
      {
        kind: "query",
        key: "q1",
        node: createNode({
          id: "u1",
          kind: "message",
          role: "user",
          text: "hi",
          ts: 1,
        }),
      },
      {
        kind: "run",
        key: "r1",
        queryNode: null,
        nodes: [content],
        renderEntries: [{ kind: "node", key: "n1", node: content }],
      },
    ];

    const { runKeyByNodeId, taskGroupKeyByNodeId } =
      buildNodeCollapseTargets(displayItems);

    expect(runKeyByNodeId.get("c1")).toBe("r1");
    expect(taskGroupKeyByNodeId.has("c1")).toBe(false);
  });

  it("maps task-group nodes to their task-group collapse key", () => {
    const content = createNode({
      id: "c1",
      kind: "content",
      text: "answer",
      ts: 2,
    });
    const displayItems: TimelineDisplayItem[] = [
      {
        kind: "standalone",
        key: "s1",
        renderEntry: {
          kind: "task-group",
          key: "task_group_t1_c1",
          taskId: "t1",
          taskName: "Task",
          status: "done",
          durationMs: 0,
          error: "",
          nodes: [content],
          renderEntries: [{ kind: "node", key: "n1", node: content }],
        },
      },
    ];

    const { runKeyByNodeId, taskGroupKeyByNodeId } =
      buildNodeCollapseTargets(displayItems);

    expect(taskGroupKeyByNodeId.get("c1")).toBe("task_group_t1_c1");
    expect(runKeyByNodeId.has("c1")).toBe(false);
  });
});

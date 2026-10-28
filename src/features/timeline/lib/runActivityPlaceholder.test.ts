import type { TimelineNode } from "./timelineState";
import type { TimelineDisplayItem } from "./timelineDisplay";
import { hasDisplayableTimelineItem } from "./runActivityPlaceholder";

const content = (id: string): TimelineNode => ({
  id,
  kind: "content",
  text: "answer",
  ts: 1,
});

const queryItem = (): TimelineDisplayItem => ({
  kind: "query",
  key: "query_u1",
  node: { id: "u1", kind: "message", role: "user", text: "hi", ts: 1 },
});

const runItem = (nodes: TimelineNode[]): TimelineDisplayItem => ({
  kind: "run",
  key: "run_u1",
  queryNode: null,
  nodes,
  renderEntries: [],
});

const standaloneItem = (): TimelineDisplayItem => ({
  kind: "standalone",
  key: "standalone_tool",
  renderEntry: {
    kind: "node",
    key: "node_t1",
    node: { id: "t1", kind: "tool", text: "tool", ts: 1 },
  },
});

it("does not count query rows as displayable output", () => {
  expect(hasDisplayableTimelineItem([])).toBe(false);
  expect(hasDisplayableTimelineItem([queryItem()])).toBe(false);
});

it("counts a run entry only once it carries a real node", () => {
  expect(hasDisplayableTimelineItem([queryItem(), runItem([])])).toBe(false);
  expect(hasDisplayableTimelineItem([queryItem(), runItem([content("a1")])])).toBe(true);
});

it("counts standalone nodes such as tools and the live activity line", () => {
  expect(hasDisplayableTimelineItem([queryItem(), standaloneItem()])).toBe(true);
});

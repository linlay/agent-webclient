import { moveSidebarItem, normalizeSidebarOrder, sortSidebarItems } from "./sidebarOrder";

it("inserts before/after targets in either direction without mutating input", () => {
  const ids = ["a", "b", "c"];
  expect(moveSidebarItem([], ids, "c", "a", false)).toEqual(["c", "a", "b"]);
  expect(moveSidebarItem([], ids, "a", "c", true)).toEqual(["b", "c", "a"]);
  expect(moveSidebarItem([], ids, "a", "c", false)).toEqual(["b", "a", "c"]);
  expect(ids).toEqual(["a", "b", "c"]);
});

it("preserves unloaded IDs and appends new entries in their default order", () => {
  const order = moveSidebarItem(["a", "unloaded", "b"], ["a", "b", "new"], "new", "b", false);
  expect(order).toEqual(["a", "unloaded", "new", "b"]);
  expect(sortSidebarItems(["b", "new", "newer", "a", "latest"], order, id => id)).toEqual(["a", "new", "b", "newer", "latest"]);
});

it("ignores self, foreign or disappeared targets and malformed stored values", () => {
  const order = ["a", "b"];
  expect(moveSidebarItem(order, order, "a", "a", true)).toBe(order);
  expect(moveSidebarItem(order, order, "foreign", "b", true)).toBe(order);
  expect(moveSidebarItem(order, ["a"], "a", "b", true)).toBe(order);
  expect(normalizeSidebarOrder(["a", null, 3, "a", "", "b"])).toEqual(["a", "b"]);
  expect(normalizeSidebarOrder({ order })).toEqual([]);
});

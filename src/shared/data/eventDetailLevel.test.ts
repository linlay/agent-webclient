import { normalizeEventDetailLevel } from "./eventDetailLevel";

it("keeps the two Platform levels and falls back to simple", () => {
  expect(normalizeEventDetailLevel("detailed")).toBe("detailed");
  expect(normalizeEventDetailLevel("none")).toBe("simple");
  expect(normalizeEventDetailLevel("simple")).toBe("simple");
  expect(normalizeEventDetailLevel("verbose")).toBe("simple");
  expect(normalizeEventDetailLevel(undefined)).toBe("simple");
});

it.each(["summary", "full"])("does not recognize legacy detail %s", value => {
  expect(normalizeEventDetailLevel(value)).toBe("simple");
});

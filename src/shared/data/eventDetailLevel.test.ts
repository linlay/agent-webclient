import { normalizeEventDetailLevel } from "./eventDetailLevel";

it("keeps the three Platform levels and falls back to summary", () => {
  expect(normalizeEventDetailLevel("full")).toBe("full");
  expect(normalizeEventDetailLevel("none")).toBe("none");
  expect(normalizeEventDetailLevel("summary")).toBe("summary");
  expect(normalizeEventDetailLevel("verbose")).toBe("summary");
  expect(normalizeEventDetailLevel(undefined)).toBe("summary");
});

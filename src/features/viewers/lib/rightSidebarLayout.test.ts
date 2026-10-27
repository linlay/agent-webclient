import { clampRightSidebarLayoutWidth, rightSidebarWidthFromDrag } from "./rightSidebarLayout";

// 1,000px of available workspace, with a 6px collapsed gap.
const maxWidth = 994;
test("keeps chat at its 420px minimum until the collapse buffer is crossed", () => {
  expect(clampRightSidebarLayoutWidth(320, maxWidth)).toBe(320);
  expect(clampRightSidebarLayoutWidth(580, maxWidth)).toBe(580);
  expect(clampRightSidebarLayoutWidth(581, maxWidth)).toBe(580);
  expect(clampRightSidebarLayoutWidth(675, maxWidth)).toBe(580);
  expect(clampRightSidebarLayoutWidth(676, maxWidth)).toBe(maxWidth);
  expect(clampRightSidebarLayoutWidth(1400, maxWidth)).toBe(maxWidth);
});
test("a rightward drag from collapsed immediately restores chat at its minimum width", () => {
  expect(clampRightSidebarLayoutWidth(rightSidebarWidthFromDrag(maxWidth, -1, maxWidth), maxWidth)).toBe(579);
  expect(clampRightSidebarLayoutWidth(rightSidebarWidthFromDrag(580, 95, maxWidth), maxWidth)).toBe(580);
  expect(clampRightSidebarLayoutWidth(rightSidebarWidthFromDrag(580, 96, maxWidth), maxWidth)).toBe(maxWidth);
});
test("clamps on small windows and while restoring a stored collapsed width", () => {
  expect(clampRightSidebarLayoutWidth(994, 894)).toBe(894);
  expect(clampRightSidebarLayoutWidth(320, 494)).toBe(494);
  expect(clampRightSidebarLayoutWidth(10, maxWidth)).toBe(280);
});

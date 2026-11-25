/** @jest-environment jsdom */
import {
  SHEET_DISMISS_VELOCITY,
  findSheetScrollParent,
  isSheetDragCandidate,
  shouldDismissSheet,
} from "./bottomSheetGesture";

describe("bottom sheet drag gesture", () => {
  it("keeps the sheet open for a short, slow pull", () => {
    expect(shouldDismissSheet({ offset: 40, velocity: 0.1, height: 420 })).toBe(false);
  });

  it("dismisses once the pull passes the height ratio", () => {
    // 420 * 0.28 = 117.6
    expect(shouldDismissSheet({ offset: 130, velocity: 0, height: 420 })).toBe(true);
  });

  it("dismisses a short flick by velocity alone", () => {
    expect(
      shouldDismissSheet({ offset: 30, velocity: SHEET_DISMISS_VELOCITY + 0.1, height: 420 }),
    ).toBe(true);
  });

  it("never dismisses without a downward pull", () => {
    expect(shouldDismissSheet({ offset: 0, velocity: 2, height: 420 })).toBe(false);
  });

  it("claims only downward vertical pulls while the menu rests at the top", () => {
    expect(isSheetDragCandidate({ dx: 1, dy: 10, scrollTop: 0 })).toBe(true);
    expect(isSheetDragCandidate({ dx: 1, dy: 3, scrollTop: 0 })).toBe(false);
    expect(isSheetDragCandidate({ dx: 1, dy: -20, scrollTop: 0 })).toBe(false);
    expect(isSheetDragCandidate({ dx: 30, dy: 10, scrollTop: 0 })).toBe(false);
    expect(isSheetDragCandidate({ dx: 1, dy: 10, scrollTop: 40 })).toBe(false);
  });

  it("finds the scrolling menu so an un-scrolled list keeps the gesture", () => {
    const panel = document.createElement("div");
    const list = document.createElement("div");
    const row = document.createElement("button");
    list.append(row);
    panel.append(list);
    document.body.append(panel);
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
    list.style.overflowY = "auto";

    expect(findSheetScrollParent(row, panel)).toBe(list);
    expect(findSheetScrollParent(panel, panel)).toBeNull();
    panel.remove();
  });
});

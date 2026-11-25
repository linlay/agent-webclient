import { ADD_MENU_BACK_SWIPE_MIN_PX, shouldGoBackFromSwipe } from "./addMenuSwipe";

describe("add menu back swipe", () => {
  it("accepts a mostly horizontal right swipe past the threshold", () => {
    expect(shouldGoBackFromSwipe({ dx: 80, dy: 8 })).toBe(true);
    expect(shouldGoBackFromSwipe({ dx: ADD_MENU_BACK_SWIPE_MIN_PX, dy: 0 })).toBe(true);
  });

  it("rejects short, leftward and mostly vertical gestures", () => {
    expect(shouldGoBackFromSwipe({ dx: 40, dy: 0 })).toBe(false);
    expect(shouldGoBackFromSwipe({ dx: -80, dy: 0 })).toBe(false);
    expect(shouldGoBackFromSwipe({ dx: 80, dy: 70 })).toBe(false);
  });

  it("ignores gestures that start in an editable field", () => {
    expect(shouldGoBackFromSwipe({ dx: 80, dy: 0, startedInEditable: true })).toBe(false);
  });
});

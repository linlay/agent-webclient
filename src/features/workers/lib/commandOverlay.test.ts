import { createCommandOverlayState } from "@/features/workers/lib/commandOverlay";

describe("commandOverlay", () => {
  it("creates the closed overlay state without feature-specific defaults leaking from app state", () => {
    expect(createCommandOverlayState()).toEqual({
      open: false,
      type: null,
      historySearch: "",
      activeIndex: 0,
    });
  });

  it("creates an opened overlay state with stable defaults", () => {
    expect(
      createCommandOverlayState({
        type: "history",
        historySearch: "alpha",
        activeIndex: 2,
      }),
    ).toEqual({
      open: true,
      type: "history",
      historySearch: "alpha",
      activeIndex: 2,
    });
  });
});

import {
  createCommandOverlayState,
  shouldRefreshWorkerDataOnCommandOpen,
} from "@/features/workers/lib/commandOverlay";

describe("commandOverlay", () => {
  it("creates the closed overlay state without feature-specific defaults leaking from app state", () => {
    expect(createCommandOverlayState()).toEqual({
      open: false,
      type: null,
      searchText: "",
      historySearch: "",
      activeIndex: 0,
      scope: "all",
      focusArea: "search",
    });
  });

  it("creates an opened overlay state with stable defaults", () => {
    expect(
      createCommandOverlayState({
        type: "switch",
        searchText: "alpha",
        activeIndex: 2,
        scope: "team",
      }),
    ).toEqual({
      open: true,
      type: "switch",
      searchText: "alpha",
      historySearch: "",
      activeIndex: 2,
      scope: "team",
      focusArea: "search",
    });
  });

  it("refreshes worker data only when the worker switch is opened", () => {
    expect(shouldRefreshWorkerDataOnCommandOpen({ type: "switch" })).toBe(
      true,
    );
    expect(shouldRefreshWorkerDataOnCommandOpen({ type: "history" })).toBe(
      false,
    );
    expect(shouldRefreshWorkerDataOnCommandOpen({ type: "automation" })).toBe(
      false,
    );
    expect(shouldRefreshWorkerDataOnCommandOpen({ type: "agents" })).toBe(
      false,
    );
  });
});

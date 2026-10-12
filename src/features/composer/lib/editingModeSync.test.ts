import { resolveEditingModeSync, shouldClearPlanningMode } from "@/features/composer/lib/editingModeSync";

const base = { pending: false, available: true, current: undefined as boolean | undefined,
  activeRunId: "", activeRunEditingMode: undefined as boolean | undefined, adoptedRunId: "" };

describe("resolveEditingModeSync", () => {
  it("keeps an existing choice while the Agent detail is still loading", () => {
    expect(resolveEditingModeSync({ ...base, pending: true, available: false, current: true }))
      .toEqual({ adoptedRunId: "" });
    expect(shouldClearPlanningMode({ pending: true, available: false, planningMode: true })).toBe(false);
  });

  it("clears the choice only once the entry is known to be hidden", () => {
    expect(resolveEditingModeSync({ ...base, available: false, current: true }))
      .toEqual({ adoptedRunId: "", set: { enabled: undefined } });
    expect(shouldClearPlanningMode({ pending: false, available: false, planningMode: true })).toBe(true);
    expect(shouldClearPlanningMode({ pending: false, available: true, planningMode: true })).toBe(false);
  });

  it("starts a shown toggle off and keeps a later explicit choice", () => {
    expect(resolveEditingModeSync(base)).toEqual({ adoptedRunId: "", set: { enabled: false } });
    expect(resolveEditingModeSync({ ...base, current: true })).toEqual({ adoptedRunId: "" });
  });

  it("restores the running Run's choice after a reload, whichever arrives first", () => {
    // Detail first: the toggle was already initialised to off.
    expect(resolveEditingModeSync({ ...base, current: false, activeRunId: "run-1", activeRunEditingMode: true }))
      .toEqual({ adoptedRunId: "run-1", set: { enabled: true } });
    // Run first: nothing initialised yet.
    expect(resolveEditingModeSync({ ...base, activeRunId: "run-1", activeRunEditingMode: true }))
      .toEqual({ adoptedRunId: "run-1", set: { enabled: true } });
  });

  it("adopts the same Run again after the conversation state was reset", () => {
    expect(resolveEditingModeSync({ ...base, activeRunId: "run-1", activeRunEditingMode: true, adoptedRunId: "run-1" }))
      .toEqual({ adoptedRunId: "run-1", set: { enabled: true } });
  });

  it("adopts a Run once so a toggle for the next Run is not overwritten", () => {
    expect(resolveEditingModeSync({ ...base, current: false, activeRunId: "run-1",
      activeRunEditingMode: true, adoptedRunId: "run-1" })).toEqual({ adoptedRunId: "run-1" });
  });
});

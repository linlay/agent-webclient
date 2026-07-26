import {
  readExplicitEditingMode,
  resolveRunEditingMode,
} from "@/features/runs/lib/editingMode";

describe("editingMode run restoration", () => {
  it("uses the local query session before activeRun and replay", () => {
    expect(
      resolveRunEditingMode({
        runId: "run_1",
        session: { runId: "run_1", editingMode: false },
        activeRun: { runId: "run_1", editingMode: true },
        events: [
          {
            type: "request.query",
            runId: "run_1",
            editingMode: true,
          },
        ],
      }),
    ).toBe(false);
  });

  it("treats an explicit activeRun false as authoritative", () => {
    expect(
      resolveRunEditingMode({
        runId: "run_1",
        activeRun: { runId: "run_1", editingMode: false },
        events: [
          {
            type: "request.query",
            runId: "run_1",
            editingMode: true,
          },
        ],
      }),
    ).toBe(false);
  });

  it("ignores session and activeRun values from a different run", () => {
    expect(
      resolveRunEditingMode({
        runId: "run_2",
        session: { runId: "run_1", editingMode: false },
        activeRun: { runId: "run_1", editingMode: false },
        events: [
          {
            type: "request.query",
            runId: "run_2",
            editingMode: true,
          },
        ],
      }),
    ).toBe(true);
  });

  it("restores from only the matching request.query event", () => {
    expect(
      resolveRunEditingMode({
        runId: "run_2",
        events: [
          {
            type: "request.query",
            runId: "run_1",
            editingMode: true,
          },
          {
            type: "request.query",
            runId: "run_2",
            editingMode: true,
          },
        ],
      }),
    ).toBe(true);
    expect(
      resolveRunEditingMode({
        runId: "run_3",
        events: [
          {
            type: "request.query",
            runId: "run_2",
            editingMode: true,
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("accepts only explicit booleans", () => {
    expect(readExplicitEditingMode({ editingMode: true })).toBe(true);
    expect(readExplicitEditingMode({ editingMode: "true" })).toBeUndefined();
    expect(readExplicitEditingMode({})).toBeUndefined();
  });
});

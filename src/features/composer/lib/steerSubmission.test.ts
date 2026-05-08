import {
  normalizeSteerSubmissionResponse,
  resolveActiveRunId,
} from "@/features/composer/lib/steerSubmission";

describe("normalizeSteerSubmissionResponse", () => {
  it("treats missing accepted as accepted for backward-compatible steer responses", () => {
    expect(
      normalizeSteerSubmissionResponse({
        status: 200,
        code: 0,
        msg: "ok",
        data: { steered: true },
      }),
    ).toMatchObject({
      accepted: true,
      status: "accepted",
    });
  });

  it("preserves unmatched steer responses so the composer can recover visibly", () => {
    expect(
      normalizeSteerSubmissionResponse({
        status: 200,
        code: 0,
        msg: "ok",
        data: {
          accepted: false,
          status: "unmatched",
          detail: "No active run found",
        },
      }),
    ).toEqual({
      accepted: false,
      status: "unmatched",
      detail: "No active run found",
    });
  });
});

describe("resolveActiveRunId", () => {
  it("uses the current state run id while its latest event is non-terminal", () => {
    expect(
      resolveActiveRunId({
        stateRunId: "run_1",
        events: [
          { type: "run.start", runId: "run_1" },
          { type: "content.delta", runId: "run_1" },
        ],
      }),
    ).toBe("run_1");
  });

  it("does not steer a run whose latest event is terminal", () => {
    expect(
      resolveActiveRunId({
        stateRunId: "run_1",
        events: [
          { type: "run.start", runId: "run_1" },
          { type: "run.complete", runId: "run_1" },
        ],
      }),
    ).toBe("");
  });

  it("falls back to the latest non-terminal event run id when state is empty", () => {
    expect(
      resolveActiveRunId({
        stateRunId: "",
        events: [
          { type: "run.complete", runId: "run_old" },
          { type: "tool.start", runId: "run_2" },
        ],
      }),
    ).toBe("run_2");
  });
});

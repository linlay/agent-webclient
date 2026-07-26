import { canOpenWorkerWorkspace } from "@/features/workers/lib/workerWorkspace";

describe("canOpenWorkerWorkspace", () => {
  it("keeps existing workspace paths available", () => {
    expect(
      canOpenWorkerWorkspace({
        type: "agent",
        agentType: "coder",
        workspaceDir: "/workspace/coder",
      }),
    ).toBe(true);
  });

  it("allows dedicated KBASE agents without a frontend workspace path", () => {
    expect(
      canOpenWorkerWorkspace({
        type: "agent",
        agentType: "kbase",
        workspaceDir: undefined,
      }),
    ).toBe(true);
  });

  it("does not broaden workspace access for other workers", () => {
    expect(
      canOpenWorkerWorkspace({
        type: "agent",
        agentType: "agent",
        workspaceDir: undefined,
      }),
    ).toBe(false);
    expect(
      canOpenWorkerWorkspace({
        type: "team",
        workspaceDir: undefined,
      }),
    ).toBe(false);
  });
});

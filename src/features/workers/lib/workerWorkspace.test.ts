import { canOpenWorkerWorkspace, openWorkerDirectory } from "@/features/workers/lib/workerWorkspace";
import type { WorkerRow } from "./workerState";
import { openRegisteredAgentDirectory } from "@/shared/data/desktop/desktopFileSystem";

jest.mock("@/shared/data/desktop/desktopFileSystem", () => ({
  openRegisteredAgentDirectory: jest.fn(),
}));

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

describe("openWorkerDirectory", () => {
  const open = jest.mocked(openRegisteredAgentDirectory);
  const debug = jest.fn();
  const t = (key: string) => key;
  const row = { type: "agent", agentType: "coder", sourceId: " alpha " } as WorkerRow;
  beforeEach(() => {
    debug.mockClear();
    open.mockReset().mockResolvedValue(true);
  });

  it.each(["workspace", "config"] as const)("opens the registered %s path with trimmed identity", async (directoryType) => {
    await openWorkerDirectory({ ...row, workspaceDir: " /work ", agentConfigDir: " /config " }, directoryType, t, debug);
    expect(open).toHaveBeenCalledWith({
      agentKey: "alpha", directoryType, desktopPath: directoryType === "workspace" ? "/work" : "/config",
    });
    expect(debug).not.toHaveBeenCalled();
  });

  it("resolves a kbase workspace through the host without a frontend path", async () => {
    await openWorkerDirectory({ ...row, agentType: "kbase" }, "workspace", t, debug);
    expect(open).toHaveBeenCalledWith({ agentKey: "alpha", directoryType: "workspace" });
  });

  it("retains unavailable browser-folder and config diagnostics without calling the host", async () => {
    await openWorkerDirectory({ ...row, workspaceSourceKind: "browser-folder" }, "workspace", t, debug);
    await openWorkerDirectory({ ...row, sourceId: "", agentConfigDir: "/config" }, "config", t, debug);
    expect(open).not.toHaveBeenCalled();
    expect(debug.mock.calls).toEqual([
      ["[workspace] leftSidebar.browserWorkspaceOpenUnavailable"],
      ["[config directory] leftSidebar.configDirectoryUnavailable"],
    ]);
  });

  it.each([
    ["workspace", "workspace", "workspaceUnavailable"],
    ["config", "config directory", "configDirectoryUnavailable"],
  ] as const)("preserves %s host refusal and error diagnostics", async (type, label, unavailable) => {
    const target = { ...row, workspaceDir: "/path", agentConfigDir: "/path" };
    open.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("host failed"));
    await openWorkerDirectory(target, type, t, debug);
    await openWorkerDirectory(target, type, t, debug);
    expect(debug.mock.calls).toEqual([
      [`[${label}] leftSidebar.${unavailable}: /path`],
      [`[${label} open error] host failed`],
    ]);
  });
});

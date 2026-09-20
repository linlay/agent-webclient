import { changeProjectGitBranch, getProjectGit, getProjectGitBranches } from "./routedClient";
import { requestDataThroughExecutor } from "./dataRequestExecutor";
import * as http from "./requests/projects";
import { getBackendMode } from "@/shared/config/backendMode";

jest.mock("./dataRequestExecutor", () => ({ requestDataThroughExecutor: jest.fn() }));
jest.mock("./requests/projects", () => ({ getProjectGit: jest.fn(), getProjectGitBranches: jest.fn(), changeProjectGitBranch: jest.fn() }));
jest.mock("@/shared/config/backendMode", () => ({ getBackendMode: jest.fn() }));
const mutation = { agentKey: "demo", operation: "switch" as const, branch: "main", expectedRevision: "observed" };
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getBackendMode).mockReturnValue("platform");
  jest.mocked(requestDataThroughExecutor).mockResolvedValue({ code: 0, msg: "ok" });
});
it("routes all three Git operations over Platform WS with unchanged payloads", async () => {
  await getProjectGit("demo");
  await getProjectGitBranches("demo");
  await changeProjectGitBranch(mutation);
  expect(requestDataThroughExecutor).toHaveBeenNthCalledWith(1, "/api/project/git", { agentKey: "demo" });
  expect(requestDataThroughExecutor).toHaveBeenNthCalledWith(2, "/api/project/git/branches", { agentKey: "demo" });
  expect(requestDataThroughExecutor).toHaveBeenNthCalledWith(3, "/api/project/git/branches", mutation);
  expect(http.getProjectGit).not.toHaveBeenCalled();
  expect(http.changeProjectGitBranch).not.toHaveBeenCalled();
});
it("preserves gateway HTTP routing and read cancellation", async () => {
  jest.mocked(getBackendMode).mockReturnValue("gateway");
  const options = { signal: new AbortController().signal };
  await getProjectGit("demo", options);
  await getProjectGitBranches("demo", options);
  await changeProjectGitBranch(mutation);
  expect(http.getProjectGit).toHaveBeenCalledWith("demo", options);
  expect(http.getProjectGitBranches).toHaveBeenCalledWith("demo", options);
  expect(http.changeProjectGitBranch).toHaveBeenCalledWith(mutation);
  expect(requestDataThroughExecutor).not.toHaveBeenCalled();
});
it("never retries or falls back to HTTP after a WS write failure", async () => {
  jest.mocked(requestDataThroughExecutor).mockRejectedValue(new Error("connection lost"));
  await expect(changeProjectGitBranch(mutation)).rejects.toThrow("connection lost");
  expect(requestDataThroughExecutor).toHaveBeenCalledTimes(1);
  expect(http.changeProjectGitBranch).not.toHaveBeenCalled();
});

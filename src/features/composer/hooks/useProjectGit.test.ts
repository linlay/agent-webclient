/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getProjectGit } from "@/shared/data/api/routedClient";
import { projectGitCache, projectGitCacheKey } from "@/features/composer/lib/projectGitCache";
import { useProjectGit } from "./useProjectGit";

jest.mock("@/shared/data/api/routedClient", () => ({ getProjectGit: jest.fn() }));
let root: Root;
let current: ReturnType<typeof useProjectGit>;
function Harness({ agent, workspace }: { agent: string; workspace?: string }) {
  current = useProjectGit(agent, workspace);
  return null;
}
const response = (agentKey: string, branch = "real") => ({ code: 0, msg: "ok", data: { agentKey, status: "branch" as const, branch } });
async function render(agent: string, workspace: string | undefined = "/workspace") {
  await act(async () => root.render(React.createElement(Harness, { agent, workspace })));
}
async function focus(elapsed = 0) {
  jest.setSystemTime(Date.now() + elapsed);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers().setSystemTime(100_000);
  jest.clearAllMocks();
  projectGitCache.clear();
  jest.mocked(getProjectGit).mockImplementation(async key => response(key));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); projectGitCache.clear(); jest.useRealTimers(); });
it("requires a real Workspace before requesting, regardless of mode or expectedBranch", async () => {
  await render("");
  for (const workspace of ["", "  ", "@chat"]) {
    await render("knowledge", workspace);
    await focus();
    expect(current).toBeNull();
  }
  await act(async () => root.render(React.createElement(Harness, { agent: "knowledge" })));
  expect(getProjectGit).not.toHaveBeenCalled();
  await render("knowledge");
  expect(current).toMatchObject({ status: "branch", branch: "real" });
  expect(getProjectGit).toHaveBeenCalledTimes(1);
});
it("reuses real HEAD for 30 seconds across focus, visibility and remounts", async () => {
  await render("knowledge");
  await focus(29_999);
  await act(async () => root.render(null));
  await render("knowledge");
  expect(getProjectGit).toHaveBeenCalledTimes(1);
  await focus(1);
  expect(getProjectGit).toHaveBeenCalledTimes(2);
  await render("knowledge", "/new/root");
  expect(getProjectGit).toHaveBeenCalledTimes(3);
  await render("");
  expect(current).toBeNull();
});
it("shares the pending request across StrictMode subscription replay", async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  jest.mocked(getProjectGit).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(Harness, { agent: "one", workspace: "/workspace" }),
  )));
  expect(getProjectGit).toHaveBeenCalledTimes(1);
  expect(jest.mocked(getProjectGit).mock.calls[0][1]?.signal?.aborted).toBe(false);
  await act(async () => resolve(response("one")));
  expect(current).toMatchObject({ agentKey: "one", branch: "real" });
});
it.each(["not_repository", "no_workspace"] as const)("caches %s for five minutes", async status => {
  jest.mocked(getProjectGit).mockResolvedValue({ code: 0, msg: "ok", data: { agentKey: "one", status } });
  await render("one");
  await focus(299_999);
  expect(getProjectGit).toHaveBeenCalledTimes(1);
  await focus(1);
  expect(getProjectGit).toHaveBeenCalledTimes(2);
});
it("aborts the previous agent and ignores late WS responses even when abort is ignored", async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  jest.mocked(getProjectGit).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render("old");
  expect(current?.status).toBe("loading");
  const signal = jest.mocked(getProjectGit).mock.calls[0][1]?.signal;
  await render("new");
  expect(signal?.aborted).toBe(true);
  await act(async () => resolveOld(response("old", "wrong-branch")));
  expect(current).toMatchObject({ agentKey: "new", branch: "real" });
});
it("backs off errors and rejects mismatched/empty branch responses before recovering", async () => {
  jest.mocked(getProjectGit).mockRejectedValueOnce(new Error("offline"));
  await render("one");
  expect(current?.status).toBe("unavailable");
  await focus(9_999);
  expect(getProjectGit).toHaveBeenCalledTimes(1);
  jest.mocked(getProjectGit).mockResolvedValueOnce(response("wrong"));
  await focus(1);
  expect(current?.status).toBe("unavailable");
  jest.mocked(getProjectGit).mockResolvedValueOnce(response("one", ""));
  await focus(10_000);
  expect(current?.status).toBe("unavailable");
  await focus(10_000);
  expect(current).toMatchObject({ status: "branch", branch: "real" });
});
it("shares in-flight requests between consumers and cancels only after the last unsubscribes", async () => {
  jest.mocked(getProjectGit).mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(Harness, { key: "a", agent: "one", workspace: "/workspace" }),
    React.createElement(Harness, { key: "b", agent: "one", workspace: "/workspace" }),
  )));
  await focus();
  expect(getProjectGit).toHaveBeenCalledTimes(1);
  const signal = jest.mocked(getProjectGit).mock.calls[0][1]?.signal;
  await act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(Harness, { key: "b", agent: "one", workspace: "/workspace" }),
  )));
  expect(signal?.aborted).toBe(false);
  await act(async () => root.render(null));
  expect(signal?.aborted).toBe(true);
});
it("accepts a mutation snapshot without a second query and discards older in-flight reads", async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  jest.mocked(getProjectGit).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await render("one");
  await act(async () => projectGitCache.put(projectGitCacheKey("one", "/workspace"), response("one", "new").data));
  await act(async () => resolve(response("one", "old")));
  await focus();
  expect(current).toMatchObject({ branch: "new" });
  expect(getProjectGit).toHaveBeenCalledTimes(1);
});
it("isolates cache entries by backend and workspace", () => {
  const first = projectGitCacheKey("one", "/workspace");
  expect(projectGitCacheKey("one", "/other")).not.toBe(first);
  globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
  expect(projectGitCacheKey("one", "/workspace")).not.toBe(first);
  delete globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
});

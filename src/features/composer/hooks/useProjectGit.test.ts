/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getProjectGit } from "@/shared/data/api/requests/projects";
import { useProjectGit } from "./useProjectGit";

jest.mock("@/shared/data/api/requests/projects", () => ({ getProjectGit: jest.fn() }));
let root: Root;
let current: ReturnType<typeof useProjectGit>;
function Harness({ agent, workspace }: { agent: string; workspace?: string }) {
  current = useProjectGit(agent, workspace);
  return null;
}
const response = (agentKey: string, branch = "real") => ({ code: 0, msg: "ok", data: { agentKey, status: "branch" as const, branch } });
async function render(agent: string, workspace?: string) {
  await act(async () => root.render(React.createElement(Harness, { agent, workspace })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.clearAllMocks();
  jest.mocked(getProjectGit).mockImplementation(async key => response(key));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); });
it("loads only a selected agent, refreshes on focus and workspace changes", async () => {
  await render("");
  expect(getProjectGit).not.toHaveBeenCalled();
  await render("knowledge");
  expect(current).toMatchObject({ status: "branch", branch: "real" });
  await render("knowledge");
  expect(getProjectGit).toHaveBeenCalledTimes(1);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(getProjectGit).toHaveBeenCalledTimes(2);
  await render("knowledge", "/new/root");
  expect(getProjectGit).toHaveBeenCalledTimes(3);
  await render("");
  expect(current).toBeNull();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(getProjectGit).toHaveBeenCalledTimes(3);
});
it("aborts the previous agent and ignores late responses even when abort is ignored", async () => {
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
it("clears the old branch while a new request is pending and on unmount", async () => {
  await render("old");
  jest.mocked(getProjectGit).mockImplementationOnce(() => new Promise(() => {}));
  await render("new");
  expect(current).toEqual({ agentKey: "new", status: "loading" });
  const signal = jest.mocked(getProjectGit).mock.calls[1][1]?.signal;
  await act(async () => root.render(null));
  expect(signal?.aborted).toBe(true);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(getProjectGit).toHaveBeenCalledTimes(2);
});
it("reports errors and malformed/mismatched responses without a made-up branch, then recovers", async () => {
  jest.mocked(getProjectGit).mockRejectedValueOnce(new Error("offline"));
  await render("one");
  expect(current?.status).toBe("unavailable");
  jest.mocked(getProjectGit).mockResolvedValueOnce(response("wrong"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(current?.status).toBe("unavailable");
  jest.mocked(getProjectGit).mockResolvedValueOnce(response("one", ""));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(current?.status).toBe("unavailable");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(current).toMatchObject({ status: "branch", branch: "real" });
});
it("coalesces focus and visibility refreshes while a request is pending", async () => {
  jest.mocked(getProjectGit).mockImplementationOnce(() => new Promise(() => {}));
  await render("one");
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(getProjectGit).toHaveBeenCalledTimes(1);
});

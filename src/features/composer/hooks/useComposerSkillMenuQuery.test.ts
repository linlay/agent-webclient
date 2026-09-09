/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgentSkills, invalidateAgentSkills } from "@/shared/data/api/routedClient";
import { dataQueryCache } from "@/shared/data/query/serverState";
import { useAgentSkillsQuery } from "@/shared/data/query/queries";
import { useComposerSkillMenuQuery } from "./useComposerSkillMenuQuery";

jest.mock("@/shared/data/api/routedClient", () => ({ getAgentSkills: jest.fn(), invalidateAgentSkills: jest.fn() }));
let root: Root;
let current: ReturnType<typeof useComposerSkillMenuQuery>;
function Harness({ enabled, agent = "demo" }: { enabled: boolean; agent?: string }) {
  current = useComposerSkillMenuQuery(agent, { enabled });
  return null;
}
function CachedHarness({ enabled }: { enabled: boolean }) {
  useAgentSkillsQuery("labels", { enabled });
  return null;
}
async function render(enabled: boolean, agent = "demo") {
  await act(async () => root.render(React.createElement(Harness, { enabled, agent })));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  dataQueryCache.clear();
  jest.mocked(getAgentSkills).mockImplementation(async agentKey => ({ code: 0, msg: "", data: { agentKey, skills: [{ key: "a", name: "A", agentHasSkill: false }] } }));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); });

it("refreshes each opening inside TTL but not while typing or while closed", async () => {
  await render(false);
  expect(getAgentSkills).not.toHaveBeenCalled();
  await render(true);
  expect(getAgentSkills).toHaveBeenCalledTimes(1);
  await render(true);
  await render(true);
  expect(getAgentSkills).toHaveBeenCalledTimes(1);
  await render(false);
  jest.mocked(getAgentSkills).mockResolvedValueOnce({ code: 0, msg: "", data: { agentKey: "demo", skills: [{ key: "new", name: "New", agentHasSkill: false }] } });
  await render(true);
  expect(getAgentSkills).toHaveBeenCalledTimes(2);
  expect(current.data?.skills[0].key).toBe("new");
  expect(invalidateAgentSkills).toHaveBeenCalledTimes(2);
});

it("refreshes on menu remount and agent changes but never queries an empty agent", async () => {
  await render(true);
  await act(async () => root.render(null));
  await render(true);
  await render(true, "other");
  expect(getAgentSkills).toHaveBeenCalledTimes(3);
  expect(current.data?.agentKey).toBe("other");
  await render(true, "  ");
  expect(getAgentSkills).toHaveBeenCalledTimes(3);
});

it("preserves cached reads for non-menu consumers", async () => {
  for (const enabled of [true, false, true]) {
    await act(async () => root.render(React.createElement(CachedHarness, { enabled })));
  }
  expect(getAgentSkills).toHaveBeenCalledTimes(1);
  expect(invalidateAgentSkills).not.toHaveBeenCalled();
});

it("does not retry a failed request until explicit retry or reopening", async () => {
  jest.mocked(getAgentSkills).mockRejectedValueOnce(new Error("offline"));
  await render(true, "failure");
  expect(current.status).toBe("error");
  await render(true, "failure");
  expect(getAgentSkills).toHaveBeenCalledTimes(1);
  await act(async () => { await current.refetch(); });
  expect(current.status).toBe("success");
  expect(getAgentSkills).toHaveBeenCalledTimes(2);
  await render(false, "failure");
  await render(true, "failure");
  expect(getAgentSkills).toHaveBeenCalledTimes(3);
});

it("late results from a prior opening cannot replace the newly refreshed list", async () => {
  let resolveOld!: (response: Awaited<ReturnType<typeof getAgentSkills>>) => void;
  jest.mocked(getAgentSkills).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render(true);
  await render(false);
  jest.mocked(getAgentSkills).mockResolvedValueOnce({ code: 0, msg: "", data: { agentKey: "demo", skills: [{ key: "new", name: "New", agentHasSkill: false }] } });
  await render(true);
  expect(current.data?.skills[0].key).toBe("new");
  await act(async () => resolveOld({ code: 0, msg: "", data: { agentKey: "demo", skills: [{ key: "old", name: "Old", agentHasSkill: false }] } }));
  expect(current.data?.skills[0].key).toBe("new");
});

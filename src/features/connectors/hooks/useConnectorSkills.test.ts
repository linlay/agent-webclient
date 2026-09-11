/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getConnectorSkills, getConnectorSkillDetail } from "@/shared/data";
import { useConnectorSkills } from "./useConnectorSkills";

jest.mock("@/shared/data", () => ({ getConnectorSkills: jest.fn(), getConnectorSkillDetail: jest.fn() }));
const skill = (name: string) => ({ name, description: name, path: `skills/${name}/SKILL.md`, size: 10, updatedAt: 0 });
const response = (connectorId: string, name: string) => ({ code: 0, msg: "", data: { connectorId, skill: skill(name), content: `${connectorId}/${name}`, sha256: name } });
let current: ReturnType<typeof useConnectorSkills>;
let root: Root;
function Harness({ id }: { id: string }) { current = useConnectorSkills(id, "v1"); return null; }
const render = async (id: string) => { await act(async () => root.render(React.createElement(Harness, { id }))); };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  jest.mocked(getConnectorSkills).mockImplementation(async id => ({ code: 0, msg: "", data: { connectorId: id, skills: [skill("one"), skill("two")] } }));
  jest.mocked(getConnectorSkillDetail).mockImplementation(async (id, name) => response(id, name));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); });

it("ignores stale detail responses when changing the skill and connector", async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  jest.mocked(getConnectorSkillDetail).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render("first");
  await act(async () => current.select("two"));
  expect(current.detail?.content).toBe("first/two");
  await render("second");
  expect(current.detail?.content).toBe("second/one");
  await act(async () => resolveOld(response("first", "one")));
  expect(current.detail?.content).toBe("second/one");
});

it("reports a detail failure without showing the previous skill and supports retry", async () => {
  await render("demo");
  jest.mocked(getConnectorSkillDetail).mockRejectedValueOnce(new Error("Skill removed"));
  await act(async () => current.select("two"));
  expect(current.detail).toBeNull();
  expect(current.detailError).toBe("Skill removed");
  await act(async () => current.reload());
  expect(current.detailError).toBe("");
  expect(current.detail?.content).toBe("demo/two");
});

it("ignores a previous connector's list response and clears a failed catalog on retry", async () => {
  let resolveOld!: (value: any) => void;
  jest.mocked(getConnectorSkills).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render("first");
  jest.mocked(getConnectorSkills).mockRejectedValueOnce(new Error("Unavailable"));
  await render("second");
  await act(async () => resolveOld({ code: 0, data: { connectorId: "first", skills: [skill("old")] } }));
  expect(current.skills).toEqual([]);
  expect(current.listError).toBe("Unavailable");
  await act(async () => current.reload());
  expect(current.listError).toBe("");
  expect(current.skills.map(item => item.name)).toEqual(["one", "two"]);
});

/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAdminSkillCatalog } from "./useAdminSkillCatalog";
import { getAdminSkills, putAdminSkillPin } from "@/shared/data";
import { I18nProvider } from "@/shared/i18n";
import type { AdminSkillsResponse } from "@/shared/data";

jest.mock("@/shared/data", () => ({ getAdminSkills: jest.fn(), putAdminSkillPin: jest.fn() }));
let mockSession = 1;
jest.mock("@/shared/data/auth/dataSession", () => ({ getDataSessionRevision: () => mockSession }));
const catalog = (pinned: string[] = []): AdminSkillsResponse => ({ skills: [{ id: "demo", status: "ready" }], packages: [], pinned });
const response = (data: AdminSkillsResponse) => ({ code: 0, msg: "", data });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let current: ReturnType<typeof useAdminSkillCatalog>;
function Harness() { current = useAdminSkillCatalog(); return null; }
let root: Root;
let node: HTMLDivElement;
const render = () => root.render(<I18nProvider locale="en-US" persistLocale={false}><Harness /></I18nProvider>);
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks(); mockSession = 1;
  jest.mocked(getAdminSkills).mockResolvedValue(response(catalog()));
  jest.mocked(putAdminSkillPin).mockResolvedValue({ code: 0, msg: "", data: { pinned: ["demo"] } });
  node = document.createElement("div"); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); });

it("does not let a pending catalog read overwrite a completed pin write", async () => {
  await act(async () => render());
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(getAdminSkills).mockReturnValueOnce(pending.promise);
  act(() => { void current.refresh(); });
  await act(async () => current.toggleSkillPin("demo"));
  await act(async () => pending.resolve(response(catalog())));
  expect(current.pinnedSkillIds).toEqual(["demo"]);
});

it("ignores window focus and rejects older explicit refresh results", async () => {
  await act(async () => render());
  await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
  expect(getAdminSkills).toHaveBeenCalledTimes(1);
  const pending = deferred<ReturnType<typeof response>>();
  jest.mocked(getAdminSkills).mockReturnValueOnce(pending.promise);
  act(() => { void current.refresh(); });
  expect(getAdminSkills).toHaveBeenCalledTimes(2);
  jest.mocked(getAdminSkills).mockResolvedValueOnce(response(catalog(["demo"])));
  await act(async () => current.refresh());
  await act(async () => pending.resolve(response(catalog())));
  expect(current.pinnedSkillIds).toEqual(["demo"]);
});

it("preserves the last catalog on refresh failure and reports incompatible responses", async () => {
  await act(async () => render());
  jest.mocked(getAdminSkills).mockResolvedValueOnce({code: 0, msg: "", data: []} as any);
  await act(async () => current.refresh());
  expect(current.skills).toEqual(catalog().skills);
  expect(current.listError).not.toBeNull();
});

it("clears old identity data and ignores its pending pin response", async () => {
  await act(async () => render());
  const write = deferred<{code: number; msg: string; data: {pinned: string[]}}>();
  jest.mocked(putAdminSkillPin).mockReturnValueOnce(write.promise);
  act(() => { void current.toggleSkillPin("demo"); });
  mockSession = 2;
  const read = deferred<ReturnType<typeof response>>();
  jest.mocked(getAdminSkills).mockReturnValueOnce(read.promise);
  await act(async () => render());
  expect(current.skills).toEqual([]);
  expect(current.pinsDisabled).toBe(true);
  await act(async () => write.resolve({code: 0, msg: "", data: {pinned: ["demo"]}}));
  await act(async () => read.resolve(response(catalog())));
  expect(current.pinnedSkillIds).toEqual([]);
  expect(current.pinsDisabled).toBe(false);
});

/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { SkillConsole } from "./SkillConsole";
import { usePinnedSkills } from "../hooks/usePinnedSkills";
import { I18nProvider } from "@/shared/i18n";
import { getAdminSkills, getAdminSkillDetail } from "@/shared/data";
import { getSkillOrder, putSkillOrder } from "@/shared/data/api/routedClient";
import { dataQueryCache } from "@/shared/data/query/serverState";

jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"), getAdminSkills: jest.fn(), getAdminSkillDetail: jest.fn(),
}));
jest.mock("@/shared/data/api/routedClient", () => ({
  ...jest.requireActual("@/shared/data/api/routedClient"), getSkillOrder: jest.fn(), putSkillOrder: jest.fn(),
}));
jest.mock("@/shared/ui/CodeEditor", () => ({ CodeEditor: () => null }));
const skills = [
  { key: "demo", name: "Demo", status: "ready" as const },
  { key: "pdf", name: "PDF", status: "ready" as const },
  { key: "invalid", name: "Invalid", status: "invalid" as const },
];
let serverOrder: string[];
let container: HTMLDivElement;
let root: Root;
const onSelect = jest.fn();
function ComposerOrderObserver() {
  const { pinnedSkillKeys } = usePinnedSkills(false);
  return React.createElement("output", { "aria-label": "Composer order" }, pinnedSkillKeys.join(","));
}
const mount = async () => act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false },
  React.createElement(SkillConsole, { selectedSkillKey: "demo", onSelectSkillKey: onSelect, onClearSelection: jest.fn() }),
  React.createElement(ComposerOrderObserver),
)));
const names = () => Array.from(container.querySelectorAll(".skill-console-list-item strong")).map(node => node.textContent);
const clickPin = async (name: string, pinned = false) => act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${pinned ? "取消置顶" : "置顶"} ${name}"]`)!.click());
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  dataQueryCache.clear();
  serverOrder = [];
  jest.mocked(getSkillOrder).mockImplementation(async () => ({ code: 0, msg: "", data: { version: 1, order: [...serverOrder] } }));
  jest.mocked(putSkillOrder).mockImplementation(async ({ key, pinned }) => {
    serverOrder = serverOrder.filter(id => id !== key);
    if (pinned) serverOrder.unshift(key);
    return { code: 0, msg: "", data: { version: 1, order: [...serverOrder] } };
  });
  jest.mocked(getAdminSkills).mockResolvedValue({ code: 0, msg: "", data: skills });
  jest.mocked(getAdminSkillDetail).mockResolvedValue({ code: 0, msg: "", data: {
    skill: skills[0], diagnostics: [],
    capabilities: { maxTextBytes: 1024, maxUploadBytes: 1024, canCreate: true, canRename: true, canDelete: true, canUpload: true, canDownload: true },
    fileManifest: { revision: "1", defaultOpenPath: "", counts: { files: 0, directories: 0, textFiles: 0, binaryFiles: 0, totalSize: 0 }, entries: [] },
  } });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("shares center pins with Composer without changing the selected skill, and restores on remount", async () => {
  await mount();
  await clickPin("PDF");
  await clickPin("Invalid");
  expect(names()).toEqual(["Invalid", "PDF", "Demo"]);
  expect(container.querySelector('output')?.textContent).toBe("invalid,pdf");
  expect(container.querySelector('.skill-console-list-item.is-active strong')?.textContent).toBe("Demo");
  expect(onSelect).not.toHaveBeenCalled();
  expect(getAdminSkillDetail).toHaveBeenCalledTimes(1);
  expect(container.querySelector("button button")).toBeNull();
  await act(async () => root.render(null));
  await mount();
  expect(names()).toEqual(["Invalid", "PDF", "Demo"]);
  await clickPin("PDF", true);
  expect(names()).toEqual(["Invalid", "Demo", "PDF"]);
  const input = container.querySelector<HTMLInputElement>('input[placeholder="搜索技能..."]')!;
  act(() => Simulate.change(input, { target: { value: "PDF" } } as any));
  expect(names()).toEqual(["PDF"]);
  await clickPin("PDF");
  expect(input.value).toBe("PDF");
});

it("retains the visible skill order on write failure and reloads remote changes on focus", async () => {
  await mount();
  jest.mocked(putSkillOrder).mockRejectedValueOnce(new Error("offline"));
  await clickPin("PDF");
  expect(names()).toEqual(["Demo", "PDF", "Invalid"]);
  expect(container.textContent).toContain("无法同步技能置顶");
  serverOrder = ["pdf"];
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(names()[0]).toBe("PDF");
  expect(container.querySelector('output')?.textContent).toBe("pdf");
  expect(container.textContent).not.toContain("无法同步技能置顶");
});

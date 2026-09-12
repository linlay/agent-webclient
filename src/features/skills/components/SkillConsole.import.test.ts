/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { notification } from "antd";
import { SkillConsole } from "./SkillConsole";
import { I18nProvider } from "@/shared/i18n";
import { ApiError, getAdminSkills, getAdminSkillDetail, importAdminSkill } from "@/shared/data";
import type { AdminSkillSummary, AdminSkillDetailResponse } from "@/shared/data";
import { getSkillOrder } from "@/shared/data/api/routedClient";
import { dataQueryCache } from "@/shared/data/query/serverState";

jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  getAdminSkills: jest.fn(), getAdminSkillDetail: jest.fn(), importAdminSkill: jest.fn(),
}));
jest.mock("@/shared/data/api/routedClient", () => ({
  ...jest.requireActual("@/shared/data/api/routedClient"), getSkillOrder: jest.fn(),
}));
jest.mock("@/shared/ui/CodeEditor", () => ({ CodeEditor: () => null }));

const oldSkills: AdminSkillSummary[] = [
  { key: "member-a", name: "Member A", status: "ready", version: "1" },
  { key: "removed", name: "Removed member", status: "ready", version: "1" },
];
function detail(skill = oldSkills[0]): AdminSkillDetailResponse {
  return {
    skill,
    capabilities: { maxTextBytes: 1024, maxUploadBytes: 1024, canCreate: true, canRename: true, canDelete: true, canUpload: true, canDownload: true },
    fileManifest: { revision: "1", counts: { files: 0, directories: 0, textFiles: 0, binaryFiles: 0, totalSize: 0 }, entries: [] },
  };
}
let container: HTMLDivElement;
let root: Root;
const onSelect = jest.fn();
const onClear = jest.fn();

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  dataQueryCache.clear();
  jest.spyOn(notification, "success").mockImplementation(() => {});
  jest.spyOn(notification, "error").mockImplementation(() => {});
  jest.mocked(getAdminSkills).mockResolvedValue({ code: 0, msg: "", data: oldSkills });
  jest.mocked(getAdminSkillDetail).mockResolvedValue({ code: 0, msg: "", data: detail() });
  jest.mocked(getSkillOrder).mockResolvedValue({ code: 0, msg: "", data: { version: 1, order: [] } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false },
    React.createElement(SkillConsole, { selectedSkillKey: "member-a", onSelectSkillKey: onSelect, onClearSelection: onClear }))));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function selectZIP() {
  const openButton = container.querySelector<HTMLButtonElement>('button[aria-label="新建技能"]');
  expect(openButton).toBeDefined();
  await act(async () => openButton!.click());
  const manual = Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent?.includes("手工创建")) as HTMLElement;
  expect(manual).toBeDefined();
  await act(async () => manual.click());
  const file = new File(["server detects the archive"], "download.zip", { type: "application/zip" });
  const input = document.body.querySelector<HTMLInputElement>('input[type="file"][accept=".zip,application/zip"]')!;
  await act(async () => Simulate.change(input, { target: { files: [file] } } as any));
  expect(document.body.querySelector<HTMLInputElement>("#skill-import-key")?.value).toBe("");
  return file;
}
async function submitZIP() {
  const submit = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".ant-modal-footer button"))
    .find((button) => button.textContent?.includes("导入 ZIP"))!;
  expect(submit.disabled).toBe(false);
  await act(async () => submit.click());
}

it("imports packages without a key, replaces the complete list and reloads an updated selected member", async () => {
  const file = await selectZIP();
  const newSkills: AdminSkillSummary[] = [
    { ...oldSkills[0], version: "2" }, { key: "member-b", name: "Member B", status: "ready" },
  ];
  jest.mocked(importAdminSkill).mockResolvedValue({ code: 0, msg: "", data: {
    kind: "skill-package", package: { id: "office-pack", name: "办公技能包", version: "2", sha256: "zip-sha", installedAt: 1,
      skills: newSkills.map((skill) => ({ id: skill.key, version: skill.version })) },
  } });
  jest.mocked(getAdminSkills).mockResolvedValue({ code: 0, msg: "", data: newSkills });
  jest.mocked(getAdminSkillDetail).mockResolvedValue({ code: 0, msg: "", data: detail(newSkills[0]) });
  await submitZIP();
  expect(importAdminSkill).toHaveBeenCalledWith({ file });
  expect(getAdminSkills).toHaveBeenCalledTimes(2);
  expect(getAdminSkillDetail).toHaveBeenCalledTimes(2);
  expect(Array.from(container.querySelectorAll(".skill-console-list-item strong")).map((node) => node.textContent)).toEqual(["Member A", "Member B"]);
  expect(onSelect).not.toHaveBeenCalled();
  expect(notification.success).toHaveBeenCalledWith({ message: "技能包 办公技能包 已导入，共 2 个技能" });
});

it("continues to open the returned skill for legacy single-skill responses", async () => {
  await selectZIP();
  jest.mocked(importAdminSkill).mockResolvedValue({ code: 0, msg: "", data: detail({ key: "detected", name: "Detected", status: "ready" }) });
  await submitZIP();
  expect(onSelect).toHaveBeenCalledWith("detected");
  expect(container.textContent).toContain("Detected");
});

it("preserves a package conflict message instead of treating every 409 as a duplicate skill key", async () => {
  await selectZIP();
  jest.mocked(importAdminSkill).mockRejectedValue(new ApiError("skill member-a is used by agents", { status: 409 }));
  await submitZIP();
  expect(notification.error).toHaveBeenCalledWith({ message: "skill member-a is used by agents" });
  expect(document.body.querySelector("#skill-import-key")).not.toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

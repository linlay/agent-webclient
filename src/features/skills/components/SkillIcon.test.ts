/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchSkillIcon } from "@/shared/data";
import { SkillIcon } from "./SkillIcon";

jest.mock("@/shared/data", () => ({ fetchSkillIcon: jest.fn() }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: ({ name }: { name: string }) => React.createElement("i", { "data-icon": name }) }));
let root: Root;
let container: HTMLDivElement;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const render = async (icon?: string) => { await act(async () => root.render(React.createElement(SkillIcon, { icon }))); };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:skill-icon");
  URL.revokeObjectURL = jest.fn();
  jest.mocked(fetchSkillIcon).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });

it("loads the supplied authenticated icon and releases its Blob when removed", async () => {
  const icon = "/api/skills/icon?agentKey=zenmi&key=pdf";
  await render(icon);
  expect(fetchSkillIcon).toHaveBeenCalledWith(icon, { signal: expect.any(AbortSignal) });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:skill-icon");
  await render();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('[data-icon="skills"]')).not.toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:skill-icon");
  expect(jest.mocked(fetchSkillIcon).mock.calls[0][1]?.signal?.aborted).toBe(true);
});

it("keeps the default when a request fails or an image cannot decode", async () => {
  jest.mocked(fetchSkillIcon).mockRejectedValueOnce(new Error("unavailable"));
  await render("/api/skills/icon?agentKey=zenmi&key=missing");
  expect(container.querySelector('[data-icon="skills"]')).not.toBeNull();
  await render("/api/skills/icon?agentKey=zenmi&key=broken");
  await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('[data-icon="skills"]')).not.toBeNull();
});

it("does not show an old skill icon after the candidate changes", async () => {
  let complete!: (blob: Blob) => void;
  jest.mocked(fetchSkillIcon).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  await render("/api/skills/icon?agentKey=old&key=pdf");
  await render();
  await act(async () => complete(new Blob(["old"])));
  expect(container.querySelector("img")).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PackageSkillTree } from "./PackageSkillTree";
import type { AgentSkillPackage } from "@/shared/data/api/dto/agents";
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("antd", () => ({
  Checkbox: ({ children, checked, disabled, indeterminate, onChange, ...rest }: any) => <label><input {...rest} type="checkbox" checked={checked || false} disabled={disabled} data-mixed={indeterminate || undefined} onChange={onChange} />{children}</label>,
  Popover: ({ children }: any) => children,
}));
const pkg: AgentSkillPackage = { id: "office", name: "Office", version: "1", skills: [{ id: "word" }, { id: "excel" }], missingSkillIds: [], status: "ready" };
const skills = [{ key: "word", name: "Word", configured: false }, { key: "excel", name: "Excel", configured: false }];
describe("PackageSkillTree", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  test("row expansion does not select a package; bulk and member buttons do", () => {
    const onSelect = jest.fn();
    act(() => root.render(<PackageSkillTree pkg={pkg} skills={skills} selectedKeys={[]} onSelect={onSelect} />));
    act(() => container.querySelector("summary")!.click());
    expect(onSelect).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="packageComposer.select"]')!.click());
    expect(onSelect).toHaveBeenLastCalledWith(skills, true);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Word"]')!.click());
    expect(onSelect).toHaveBeenLastCalledWith([skills[0]], true);
  });
  test("partial selection is mixed, incomplete package disables bulk selection but not valid members", () => {
    act(() => root.render(<PackageSkillTree pkg={{ ...pkg, missingSkillIds: ["slides"], status: "incomplete" }} skills={skills} selectedKeys={["word"]} onSelect={jest.fn()} />));
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="packageComposer.select"]')!.disabled).toBe(true);
    expect(container.querySelector("summary")!.dataset.selection).toBe("partial");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Word"]')!.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Word"]')!.getAttribute("aria-pressed")).toBe("true");
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("slides"))!.disabled).toBe(true);
  });
  test("forced members cannot be removed, and search retains matching member within its package", () => {
    act(() => root.render(<PackageSkillTree pkg={pkg} skills={skills} selectedKeys={["word"]} lockedKeys={["word"]} search="word" onSelect={jest.fn()} />));
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Word"]')!.disabled).toBe(true);
    expect(container.querySelector("details")!.open).toBe(true);
  });
});

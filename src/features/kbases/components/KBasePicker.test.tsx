/** @jest-environment jsdom */
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {KBasePicker} from "./KBasePicker";
import {KBaseSelectionTags} from "./KBaseSelectionTags";
import type {SelectedKBase} from "../lib/kbasesState";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("antd", () => ({Checkbox: ({checked, disabled, onChange, children}: any) => <label><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />{children}</label>, Input: ({allowClear, ...props}: any) => <input {...props} />}));
jest.mock("@/shared/ui/UiButton", () => ({UiButton: ({children, variant, size, ...props}: any) => <button {...props}>{children}</button>}));
it("searches, multi-selects readable old indexes and clears the selection", () => {
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const refresh = jest.fn();
 let selected: SelectedKBase[] = [];
 const catalog = {status: "success" as const, refresh, data: {agentKey: "a", capability: {available: true}, libraries: [
  {id: "a", name: "Products", description: "Release notes", collections: [], readable: true, indexing: true, degraded: false},
  {id: "b", name: "Engineering", description: "Architecture", collections: [], readable: true, indexing: false, degraded: true},
  {id: "c", name: "Unavailable", collections: [], readable: false, indexing: true, degraded: false},
 ]}};
 function render() {root.render(<KBasePicker catalog={catalog} selected={selected} onChange={items => {selected = items; render();}} />);}
 act(render);
 expect(refresh).toHaveBeenCalledTimes(1);
 const checks = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
 expect(checks[2].disabled).toBe(true);
 act(() => checks[0].click()); act(() => checks[1].click());
 expect(selected.map(item => item.id)).toEqual(["a", "b"]);
 const search = host.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
 act(() => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Architecture"); search.dispatchEvent(new Event("input", {bubbles: true}));});
 expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
 act(() => host.querySelector<HTMLButtonElement>("button")!.click());
 expect(selected).toEqual([]);
 act(() => root.unmount()); host.remove();
});
it("separates fixed binding, folds four choices and removes one without clearing others", () => {
 const host = document.createElement("div"); const root = createRoot(host); const change = jest.fn();
 act(() => root.render(<KBaseSelectionTags boundLibrary={{id: "fixed", name: "Fixed"}} selected={[1,2,3,4].map(id => ({id: String(id), name: `Library ${id}`}))} onChange={change} />));
 expect(host.textContent).toContain("Fixed"); expect(host.textContent).toContain("+1"); expect(host.textContent).not.toContain("Library 4");
 act(() => host.querySelector<HTMLButtonElement>('button[aria-label*="Library 2"]')!.click());
 expect(change.mock.calls[0][0].map((item: SelectedKBase) => item.id)).toEqual(["1", "3", "4"]);
 act(() => root.unmount());
});

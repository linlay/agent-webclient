/** @jest-environment jsdom */
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {KBasePicker} from "./KBasePicker";
import {KBaseSelectionTags} from "./KBaseSelectionTags";
import type {SelectedKBase} from "../lib/kbasesState";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("antd", () => ({Input: jest.requireActual("react").forwardRef(({allowClear, variant, prefix, ...props}: any, ref: any) => <input {...props} ref={ref} />), Spin: () => null}));
jest.mock("@/shared/ui/UiButton", () => ({UiButton: ({children, variant, size, ...props}: any) => <button {...props}>{children}</button>}));
it("searches and multi-selects readable old indexes", () => {
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
 const choices = host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
 expect(host.querySelector('input[type="checkbox"]')).toBeNull();
 expect(choices[2].disabled).toBe(true);
 act(() => choices[0].click()); act(() => choices[1].click());
 expect(selected.map(item => item.id)).toEqual(["a", "b"]);
 expect(choices[0].getAttribute("aria-pressed")).toBe("true");
 expect(choices[1].getAttribute("aria-pressed")).toBe("true");
 const search = host.querySelector<HTMLInputElement>('input')!;
 act(() => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Architecture"); search.dispatchEvent(new Event("input", {bubbles: true}));});
 expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(1);
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
it("blocks a ninth library and permits replacing a choice after removing one", () => {
 const host = document.createElement("div"); const root = createRoot(host);
 const libraries = Array.from({length: 10}, (_, i) => ({id: `lib-${i}`, name: `Library ${i}`, collections: [], readable: true, indexing: false, degraded: false}));
 let selected = libraries.slice(0, 8).map(({id, name}) => ({id, name}));
 const catalog = {status: "success" as const, refresh: jest.fn(), data: {agentKey: "general", capability: {available: true}, libraries}};
 function render() {root.render(<KBasePicker catalog={catalog} selected={selected} onChange={items => {selected = items; render();}} />);}
 act(render);
 const choice = (index: number) => host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[index];
 expect(choice(0).disabled).toBe(false);
 expect(choice(8).disabled).toBe(true);
 expect(host.querySelector('[role="status"]')?.textContent).toContain("8");
 act(() => choice(0).click());
 expect(choice(8).disabled).toBe(false);
 act(() => choice(8).click());
 expect(selected.map(item => item.id)).toEqual(libraries.slice(1, 9).map(item => item.id));
 expect(choice(9).disabled).toBe(true);
 act(() => root.unmount());
});

/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { ApiError, getMemoryFile, getMemoryDates, saveMemoryFile, searchMemoryFiles, getMemoryMaintenanceStatus, triggerMemoryMaintenance, cancelMemoryMaintenance } from "@/shared/data";
import type { MemoryMaintenanceStatus } from "@/shared/data";
import { MemoryInfoConsole } from "./MemoryConsole";

jest.mock("react-router-dom", () => ({ useBlocker: () => ({ state: "unblocked" }) }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/ui/ConversationMarkdown", () => ({ ConversationMarkdown: ({ content }: { content: string }) => <div>{content}</div> }));
jest.mock("@/shared/data", () => ({ ApiError: jest.requireActual("@/shared/data/api/http").ApiError, getMemoryFile: jest.fn(), getMemoryDates: jest.fn(), saveMemoryFile: jest.fn(), deleteMemoryFile: jest.fn(), searchMemoryFiles: jest.fn(), getMemoryMaintenanceStatus: jest.fn(), triggerMemoryMaintenance: jest.fn(), cancelMemoryMaintenance: jest.fn() }));
const documentData = { kind: "memory" as const, content: "Original memory", revision: "r1", exists: true };
const idle: MemoryMaintenanceStatus = { enabled: true, automatic: false, pollIntervalSeconds: 300, modelKey: "configured-model", timezone: "Asia/Shanghai", state: "idle", processedBatches: 0 };
const manual = { id: "job", startDate: "2026-10-07", endDate: "2026-10-08", includeArchived: true, state: "completed" as const, modelKey: idle.modelKey, timezone: idle.timezone, startedAt: 1, scannedChats: 8, selectedRuns: 12, skippedRuns: 0, emptyRuns: 0, processedBatches: 3, reusedBatches: 1, newFacts: 4 };
const response = <T,>(data: T) => ({ status: 200, code: 0, msg: "", data });
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: jest.fn(() => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() })) });
});
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.mocked(getMemoryFile).mockResolvedValue(response(documentData));
  jest.mocked(getMemoryDates).mockResolvedValue(response({ dates: ["2026-10-08", "2026-10-07"], today: "2026-10-08", nextBefore: "" }));
  jest.mocked(getMemoryMaintenanceStatus).mockResolvedValue(response(idle));
  jest.mocked(searchMemoryFiles).mockResolvedValue(response({ matches: [{ kind: "memory", line: 1, text: "Memory match" }], nextBefore: "", maxMatches: 40, searchedDailyFiles: 2 }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); jest.useRealTimers(); });
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.getAttribute("aria-label") === label || node.textContent?.trim() === label)!;
async function click(label: string) { await act(async () => button(label).click()); }
async function change(label: string, value: string) { await act(async () => Simulate.change(document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!, { target: { value } } as any)); }
async function mount() { await act(async () => root.render(<MemoryInfoConsole />)); }

test("keeps the date form and task details out of the page until Reload memory opens the dialog", async () => {
  await mount();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).not.toContain("memoryMaintenance.hint");
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("memoryFiles.preview");
  await click("memoryMaintenance.title");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector<HTMLInputElement>('[aria-label="memoryMaintenance.start"]')?.value).toBe("2026-10-08");
  expect(document.body.textContent).not.toContain("configured-model");
});

test("submits dates and archive selection, validates ranges, and preserves task tracking when the dialog closes", async () => {
  jest.useFakeTimers();
  await mount(); await click("memoryMaintenance.title");
  await change("memoryMaintenance.start", "2026-10-09");
  expect(button("memoryMaintenance.startAction").disabled).toBe(true);
  await change("memoryMaintenance.start", "2026-10-07");
  await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  jest.mocked(triggerMemoryMaintenance).mockResolvedValue(response({ accepted: true, status: { ...idle, manual: { ...manual, state: "queued" } } }));
  await act(async () => Simulate.submit(document.querySelector('[role="dialog"] form')!));
  expect(triggerMemoryMaintenance).toHaveBeenCalledWith({ startDate: "2026-10-07", endDate: "2026-10-08", includeArchived: true });
  await click("memoryMaintenance.close");
  expect(cancelMemoryMaintenance).not.toHaveBeenCalled();
  jest.mocked(getMemoryMaintenanceStatus).mockResolvedValue(response({ ...idle, manual }));
  await act(async () => jest.advanceTimersByTime(3000));
  await click("memoryMaintenance.title");
  expect(document.querySelector('[role="status"] strong')?.textContent).toBe("memoryMaintenance.state.completed");
  expect(document.querySelector('details')?.open).toBe(false);
});

test("viewing updated results protects an unsaved draft and only closes after refresh is accepted", async () => {
  jest.mocked(getMemoryMaintenanceStatus).mockResolvedValue(response({ ...idle, manual }));
  await mount();
  await act(async () => [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(tab => tab.textContent === "memoryFiles.edit")!.click());
  await change("memoryFiles.content", "My unsaved draft");
  await click("memoryMaintenance.title");
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  await click("memoryMaintenance.readResults");
  expect(getMemoryFile).toHaveBeenCalledTimes(1);
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe("My unsaved draft");
  expect(document.querySelector('[role="dialog"]')?.getAttribute("style")).not.toContain("display: none");
  confirm.mockReturnValue(true);
  jest.mocked(getMemoryFile).mockResolvedValue(response({ ...documentData, content: "Updated memory", revision: "r2" }));
  await click("memoryMaintenance.readResults");
  expect(getMemoryFile).toHaveBeenCalledTimes(2);
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe("Updated memory");
});

test("refresh remains available after an initial file load fails", async () => {
  jest.mocked(getMemoryFile).mockRejectedValueOnce(new ApiError("Unavailable", { status: 503 }));
  await mount();
  expect(button("memoryFiles.reload").disabled).toBe(false);
  await click("memoryFiles.reload");
  expect(container.textContent).toContain("Original memory");
});

test("searches after typing, ignores a cleared query's in-flight response, and returns to dates", async () => {
  jest.useFakeTimers();
  let finish!: (value: any) => void;
  jest.mocked(searchMemoryFiles).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await mount(); await change("memoryFiles.search", "old query");
  await act(async () => jest.advanceTimersByTime(300));
  expect(searchMemoryFiles).toHaveBeenCalledWith("old query", "");
  await change("memoryFiles.search", "");
  await act(async () => finish(response({ matches: [{ kind: "owner", line: 4, text: "Outdated match" }], nextBefore: "", maxMatches: 40, searchedDailyFiles: 2 })));
  expect(container.textContent).not.toContain("Outdated match");
  expect(container.textContent).toContain("2026-10-07");
  await change("memoryFiles.search", "new query");
  await act(async () => jest.advanceTimersByTime(300));
  expect(container.textContent).toContain("Memory match");
});

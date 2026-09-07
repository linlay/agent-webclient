/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppContext, type AppState } from "@/app/state/AppContext";
import {
  getMemoryRecord,
  getMemoryRecords,
  getMemoryScope,
  getMemoryScopes,
  previewMemoryContext,
  saveMemoryScope,
  validateMemoryScope,
} from "@/shared/data";
import {
  createInitialMemoryState,
  reduceMemoryState,
  type MemoryAction,
} from "@/features/memory/lib/memoryState";
import { useMemoryRecords } from "./useMemoryRecords";
import { useMemoryRecordsInitialization } from "./useMemoryRecordsInitialization";
import { MemoryInfoConsole } from "@/features/memory/components/MemoryConsole";
import {
  MemoryPreferencesPanelView,
  type MemoryPreferencesPanelProps,
} from "@/features/memory/components/MemoryPreferencesPanel";
import {
  MemoryPreviewPanelView,
  type MemoryPreviewPanelProps,
} from "@/features/memory/components/MemoryPreviewPanel";
import { isAppMode } from "@/shared/utils/routing";

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: jest.fn(),
  useAppState: () => useAppContext().state,
  useAppDispatch: () => useAppContext().dispatch,
}));
jest.mock("@/shared/data", () => ({
  getMemoryRecords: jest.fn(),
  getMemoryRecord: jest.fn(),
  getMemoryMeta: jest.fn(),
  getMemoryScope: jest.fn(),
  getMemoryScopes: jest.fn(),
  previewMemoryContext: jest.fn(),
  saveMemoryScope: jest.fn(),
  validateMemoryScope: jest.fn(),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: mockTranslate }) }));
jest.mock("@/shared/config/featureFlags", () => ({ isMemoryEnabled: () => true }));
jest.mock("@/shared/utils/routing", () => ({ isAppMode: jest.fn(() => false) }));
jest.mock("antd", () => ({ Modal: ({ children }: any) => children }));
jest.mock("@/features/memory/components/MemoryRecordsPanel", () => ({ MemoryRecordsPanelView: () => null }));
jest.mock("@/features/memory/components/MemoryPreferencesPanel", () => ({ MemoryPreferencesPanelView: jest.fn(() => null) }));
jest.mock("@/features/memory/components/MemoryPreviewPanel", () => ({ MemoryPreviewPanelView: jest.fn(() => null) }));

const mockTranslate = (key: string) => key;
const stateRef = { current: {} as AppState };
let root: Root;
let container: HTMLDivElement;
let records: ReturnType<typeof useMemoryRecords>;
let secondRecords: ReturnType<typeof useMemoryRecords>;
const dispatch = jest.fn((action: MemoryAction | { type: "BATCH_UPDATE"; updates: Partial<AppState> }) => {
  stateRef.current = action.type === "BATCH_UPDATE"
    ? { ...stateRef.current, ...action.updates }
    : { ...stateRef.current, ...reduceMemoryState(stateRef.current, action) };
});

function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<any>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const listResponse = (...ids: string[]) => ({
  data: {
    results: ids.map((id) => ({ id, agentKey: "record-agent" })),
    nextCursor: "next",
  },
});
const scopeResponse = (scopeType = "agent") => ({
  data: {
    scopeType,
    scopeKey: `${scopeType}:key`,
    label: scopeType.toUpperCase(),
    fileName: `${scopeType.toUpperCase()}.md`,
    markdown: `# ${scopeType}`,
    records: [],
    meta: null,
  },
});

function Harness({ open = true, initialize = false, second = false }) {
  records = useMemoryRecords(open);
  return React.createElement(React.Fragment, null,
    initialize ? React.createElement(Initializer) : null,
    second ? React.createElement(SecondHarness) : null);
}
function Initializer() {
  useMemoryRecordsInitialization();
  return null;
}
function SecondHarness() {
  secondRecords = useMemoryRecords();
  return null;
}

async function render(element = React.createElement(Harness, {})) {
  await act(async () => { root.render(element); });
}
async function settle(request: ReturnType<typeof deferred>, value: any, reject = false) {
  await act(async () => { reject ? request.reject(value) : request.resolve(value); });
}
function preferences(): MemoryPreferencesPanelProps {
  return jest.mocked(MemoryPreferencesPanelView).mock.calls.at(-1)![0];
}
function preview(): MemoryPreviewPanelProps {
  return jest.mocked(MemoryPreviewPanelView).mock.calls.at(-1)![0];
}

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  stateRef.current = {
    ...createInitialMemoryState(), agents: [], teams: [], chats: [], chatId: "",
    chatAgentById: new Map(), workerSelectionKey: "agent:alice",
    workerIndexByKey: new Map(), workerRows: [], workerRelatedChats: [],
    accessToken: "", composerDraft: "", memoryMeta: {} as AppState["memoryMeta"],
  } as AppState;
  jest.mocked(useAppContext).mockImplementation(() => ({ state: stateRef.current, stateRef, dispatch } as any));
  jest.mocked(getMemoryRecord).mockImplementation(async (_agent, id) => ({ data: { id } }) as any);
  jest.mocked(getMemoryScopes).mockResolvedValue({ data: { scopes: [] } } as any);
  jest.mocked(getMemoryScope).mockResolvedValue(scopeResponse() as any);
  jest.mocked(isAppMode).mockReturnValue(false);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("keeps initialization list-only and falls back to global records without explicit filters", async () => {
  jest.mocked(getMemoryRecords).mockResolvedValueOnce(listResponse() as any).mockResolvedValueOnce(listResponse("a") as any);
  await render(React.createElement(Harness, { initialize: true }));
  expect(getMemoryRecords).toHaveBeenNthCalledWith(1, expect.objectContaining({ agentKey: "alice" }));
  expect(getMemoryRecords).toHaveBeenNthCalledWith(2, stateRef.current.memoryInfoFilters);
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("a");
  expect(stateRef.current.memoryInfoNextCursor).toBe("next");
  expect(getMemoryRecord).not.toHaveBeenCalled();
});

it.each(["keyword", "kind", "scopeType", "status", "category"])("does not fall back with an explicit %s filter", async (field) => {
  stateRef.current.memoryInfoFilters = { ...stateRef.current.memoryInfoFilters, [field]: "filter" };
  jest.mocked(getMemoryRecords).mockResolvedValue(listResponse() as any);
  await render();
  await act(async () => { await records.loadRecords(); });
  expect(getMemoryRecords).toHaveBeenCalledTimes(1);
});

it("waits for app authentication and restarts correctly under StrictMode", async () => {
  jest.mocked(isAppMode).mockReturnValue(true);
  jest.mocked(getMemoryRecords).mockResolvedValue(listResponse("a") as any);
  const element = React.createElement(React.StrictMode, null, React.createElement(Harness, { initialize: true }));
  await render(element);
  expect(getMemoryRecords).not.toHaveBeenCalled();
  stateRef.current.accessToken = "token";
  await render(React.createElement(React.StrictMode, null, React.createElement(Harness, { initialize: true })));
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("a");
});

it("reissues initialization cancelled by the StrictMode effect cleanup", async () => {
  const old = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(old.promise).mockResolvedValueOnce(listResponse("current") as any);
  await render(React.createElement(React.StrictMode, null, React.createElement(Harness, { initialize: true })));
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("current");
  await settle(old, listResponse("old"));
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("current");
  expect(getMemoryRecords).toHaveBeenCalledTimes(2);
});

it("retries unfinished initialization for a new agent but leaves completed initialization alone", async () => {
  const old = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(listResponse("bob-record") as any);
  await render(React.createElement(Harness, { initialize: true }));
  stateRef.current.workerSelectionKey = "agent:bob";
  await render(React.createElement(Harness, { initialize: true }));
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("bob-record");
  expect(getMemoryRecords).toHaveBeenLastCalledWith(expect.objectContaining({ agentKey: "bob" }));
  await settle(old, listResponse("alice-record"));
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("bob-record");
  stateRef.current.workerSelectionKey = "agent:charlie";
  await render(React.createElement(Harness, { initialize: true }));
  expect(getMemoryRecords).toHaveBeenCalledTimes(2);
});

it("lets a manual query supersede initialization across hook instances", async () => {
  const initial = deferred();
  const manual = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(initial.promise).mockReturnValueOnce(manual.promise);
  await render(React.createElement(Harness, { initialize: true }));
  await act(async () => { void records.loadRecords(); });
  await settle(manual, listResponse("manual"));
  await settle(initial, listResponse());
  expect(getMemoryRecords).toHaveBeenCalledTimes(2);
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("manual");
  expect(stateRef.current.memoryInfoDetail?.id).toBe("manual");
});

it("preserves the latest selection made while a list request is pending", async () => {
  const request = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(request.promise);
  stateRef.current.memoryInfoSelectedRecordId = "a";
  await render();
  void records.loadRecords();
  dispatch({ type: "SET_MEMORY_INFO_SELECTED_RECORD_ID", id: "b" });
  await settle(request, listResponse("a", "b"));
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("b");
  expect(getMemoryRecord).toHaveBeenCalledWith("record-agent", "b");
});

it.each(["agent", "filter", "close"])("ignores records from a stale %s request", async (change) => {
  const request = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(request.promise);
  await render();
  void records.loadRecords();
  if (change === "agent") stateRef.current.workerSelectionKey = "agent:bob";
  if (change === "filter") dispatch({ type: "SET_MEMORY_INFO_FILTERS", filters: { scopeType: "team" } });
  await render(React.createElement(Harness, { open: change !== "close" }));
  await settle(request, listResponse("old"));
  expect(stateRef.current.memoryInfoRecords).toEqual([]);
  expect(stateRef.current.memoryInfoLoading).toBe(false);
});

it("does not let an obsolete failure clear a newer request or its loading flag", async () => {
  const old = deferred();
  const next = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  await render();
  void records.loadRecords();
  void records.loadRecords();
  await settle(old, new Error("old"), true);
  expect(stateRef.current.memoryInfoLoading).toBe(true);
  expect(stateRef.current.memoryInfoError).toBe("");
  await settle(next, listResponse("new"));
  expect(stateRef.current.memoryInfoLoading).toBe(false);
});

it("invalidates pending detail when a query clears the selection", async () => {
  const detail = deferred();
  jest.mocked(getMemoryRecord).mockReturnValueOnce(detail.promise);
  jest.mocked(getMemoryRecords).mockResolvedValue(listResponse() as any);
  stateRef.current.memoryInfoSelectedRecordId = "a";
  await render();
  void records.loadDetail("a");
  await act(async () => { await records.loadRecords(); });
  await settle(detail, { data: { id: "a" } });
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("");
  expect(stateRef.current.memoryInfoDetail).toBeNull();
  expect(stateRef.current.memoryInfoDetailLoading).toBe(false);
});

it("keeps detail fallback and ignores an older detail after selection changes", async () => {
  const old = deferred();
  jest.mocked(getMemoryRecord).mockReturnValueOnce(old.promise)
    .mockRejectedValueOnce(new Error("agent mismatch")).mockResolvedValueOnce({ data: { id: "b" } } as any);
  stateRef.current.memoryInfoSelectedRecordId = "a";
  await render();
  void records.loadDetail("a");
  dispatch({ type: "SET_MEMORY_INFO_SELECTED_RECORD_ID", id: "b" });
  await act(async () => { await records.loadDetail("b"); });
  await settle(old, { data: { id: "a" } });
  expect(getMemoryRecord).toHaveBeenLastCalledWith(undefined, "b");
  expect(stateRef.current.memoryInfoDetail?.id).toBe("b");
});

it("does not cancel another surface's newer request when a surface unmounts", async () => {
  const request = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(request.promise);
  await render(React.createElement(Harness, { second: true }));
  void records.loadRecords();
  await render(React.createElement(Harness, { second: false }));
  await settle(request, listResponse("a"));
  expect(stateRef.current.memoryInfoSelectedRecordId).toBe("a");
});

it("prevents an unmounted surface from restoring reset session state", async () => {
  const request = deferred();
  jest.mocked(getMemoryRecords).mockReturnValueOnce(request.promise);
  await render(React.createElement(Harness, { second: true }));
  void secondRecords.loadRecords();
  await render(React.createElement(Harness, { second: false }));
  dispatch({ type: "RESET_MEMORY_INFO_SESSION" });
  const afterClose = dispatch.mock.calls.length;
  await settle(request, listResponse("old"));
  expect(dispatch).toHaveBeenCalledTimes(afterClose);
});

it.each([
  ["user", "catalog-first"],
  ["user", "detail-first"],
  ["team", "catalog-first"],
  ["team", "detail-first"],
] as const)("accepts a late catalog without replacing the selected %s scope (%s)", async (scopeType, order) => {
  const catalog = deferred();
  const detail = deferred();
  const scopes = ["agent", "user", "team"].map((type) => ({
    scopeType: type,
    scopeKey: `${type}:key`,
    label: `${type} catalog label`,
    fileName: `${type.toUpperCase()}.md`,
    recordCount: 2,
    updatedAt: 1_777_344_000_000,
  }));
  jest.mocked(getMemoryScopes).mockReturnValueOnce(catalog.promise);
  jest.mocked(getMemoryScope).mockReturnValueOnce(detail.promise);
  await render(React.createElement(MemoryInfoConsole));
  await act(async () => preferences().onScopeSelect(scopeType));
  expect(getMemoryScope).toHaveBeenCalledWith("alice", scopeType, undefined);
  if (order === "detail-first") await settle(detail, scopeResponse(scopeType));
  await settle(catalog, { data: { scopes } });
  expect(stateRef.current.memoryPreferenceScopes).toEqual(scopes);
  if (order === "catalog-first") {
    expect(stateRef.current.memoryPreferenceLoading).toBe(true);
    await settle(detail, scopeResponse(scopeType));
  }
  expect(stateRef.current.memoryPreferenceActiveScopeType).toBe(scopeType);
  expect(stateRef.current.memoryPreferenceActiveScopeKey).toBe(`${scopeType}:key`);
  expect(stateRef.current.memoryPreferenceLabel).toBe(scopeType.toUpperCase());
  expect(stateRef.current.memoryPreferenceLoading).toBe(false);
  expect(getMemoryScope).toHaveBeenCalledTimes(1);

  // Later selections must use the catalog's keys, even though it arrived after
  // the first selection and must not have changed that selection automatically.
  await render(React.createElement(MemoryInfoConsole));
  await act(async () => preferences().onScopeSelect("agent"));
  expect(getMemoryScope).toHaveBeenLastCalledWith("alice", "agent", "agent:key");
});

it.each(["agent", "close"])("rejects a late preference catalog after %s changes", async (change) => {
  const catalog = deferred();
  jest.mocked(getMemoryScopes).mockReturnValueOnce(catalog.promise);
  await render(React.createElement(MemoryInfoConsole));
  if (change === "agent") stateRef.current.workerSelectionKey = "agent:bob";
  await render(React.createElement(MemoryInfoConsole, { open: change !== "close" }));
  const current = stateRef.current.memoryPreferenceScopes;
  await settle(catalog, { data: { scopes: [{
    scopeType: "agent", scopeKey: "agent:alice", label: "Alice",
    fileName: "AGENT.md", recordCount: 1, updatedAt: 1_777_344_000_000,
  }] } });
  expect(stateRef.current.memoryPreferenceScopes).toEqual(current);
});

it("ignores preference detail from the previous agent", async () => {
  const old = deferred();
  jest.mocked(getMemoryScope).mockReturnValueOnce(old.promise);
  await render(React.createElement(MemoryInfoConsole));
  stateRef.current.workerSelectionKey = "agent:bob";
  jest.mocked(getMemoryScope).mockResolvedValue(scopeResponse("user") as any);
  await render(React.createElement(MemoryInfoConsole));
  await settle(old, scopeResponse("agent"));
  expect(stateRef.current.memoryPreferenceActiveScopeType).toBe("user");
  expect(stateRef.current.memoryPreferenceLoading).toBe(false);
});

it.each(["validate", "save"])("ignores preference %s completion after changing scope", async (operation) => {
  await render(React.createElement(MemoryInfoConsole));
  stateRef.current.memoryPreferenceMode = "markdown";
  await render(React.createElement(MemoryInfoConsole));
  const request = deferred();
  jest.mocked(validateMemoryScope).mockReturnValueOnce(request.promise);
  await act(async () => operation === "save" ? preferences().onSave() : preferences().onValidate());
  jest.mocked(getMemoryScope).mockResolvedValue(scopeResponse("user") as any);
  await act(async () => preferences().onScopeSelect("user"));
  await settle(request, { data: { valid: true, errors: [], warnings: [] } });
  expect(stateRef.current.memoryPreferenceActiveScopeType).toBe("user");
  expect(stateRef.current.memoryPreferenceValidation).toBeNull();
  expect(saveMemoryScope).not.toHaveBeenCalled();
});

it("does not reload an old scope when a pending save returns", async () => {
  await render(React.createElement(MemoryInfoConsole));
  await render(React.createElement(MemoryInfoConsole));
  const request = deferred();
  jest.mocked(saveMemoryScope).mockReturnValueOnce(request.promise);
  await act(async () => preferences().onSave());
  jest.mocked(getMemoryScope).mockResolvedValue(scopeResponse("user") as any);
  await act(async () => preferences().onScopeSelect("user"));
  await settle(request, { data: { scopeType: "agent", scopeKey: "agent:old", summary: {} } });
  expect(stateRef.current.memoryPreferenceActiveScopeType).toBe("user");
  expect(stateRef.current.memoryPreferenceSaveSummary).toBeNull();
});

it("keeps preference add, edit, delete and validated markdown saving available", async () => {
  await render(React.createElement(MemoryInfoConsole));
  await act(async () => preferences().onNewRecord());
  const id = stateRef.current.memoryPreferenceSelectedRecordId;
  await render(React.createElement(MemoryInfoConsole));
  await act(async () => preferences().onRecordFieldChange("title", "Edited"));
  expect(stateRef.current.memoryPreferenceRecordsDraft[0].title).toBe("Edited");
  await render(React.createElement(MemoryInfoConsole));
  await act(async () => preferences().onDeleteRecord(id));
  expect(stateRef.current.memoryPreferenceRecordsDraft).toEqual([]);
  await act(async () => preferences().onModeChange("markdown"));
  await act(async () => preferences().onMarkdownChange("# Updated"));
  await render(React.createElement(MemoryInfoConsole));
  jest.mocked(validateMemoryScope).mockResolvedValue({ data: { valid: false, errors: [], warnings: [] } } as any);
  await act(async () => preferences().onSave());
  expect(saveMemoryScope).not.toHaveBeenCalled();
  jest.mocked(validateMemoryScope).mockResolvedValue({ data: { valid: true, errors: [], warnings: [] } } as any);
  jest.mocked(saveMemoryScope).mockResolvedValue({ data: { scopeType: "agent", scopeKey: "agent:key", summary: { created: 1 } } } as any);
  await act(async () => preferences().onSave());
  expect(saveMemoryScope).toHaveBeenCalledWith(expect.objectContaining({ markdown: "# Updated", mode: "markdown", archiveMissing: true }));
  expect(stateRef.current.memoryPreferenceSaveSummary).toEqual({ created: 1 });
});

it("ignores a preview response after closing the console", async () => {
  const request = deferred();
  stateRef.current.memoryConsoleTab = "preview";
  stateRef.current.chatId = "chat";
  stateRef.current.memoryPreviewDraft = "draft";
  jest.mocked(previewMemoryContext).mockReturnValueOnce(request.promise);
  await render(React.createElement(MemoryInfoConsole));
  await act(async () => preview().onPreview());
  await render(React.createElement(MemoryInfoConsole, { open: false }));
  dispatch({ type: "RESET_MEMORY_INFO_SESSION" });
  const afterClose = dispatch.mock.calls.length;
  await settle(request, { data: { message: "old" } });
  expect(dispatch).toHaveBeenCalledTimes(afterClose);
  expect(stateRef.current.memoryPreviewResult).toBeNull();
});

it("keeps the latest preview result and ignores responses for another chat", async () => {
  const old = deferred();
  const current = deferred();
  stateRef.current.memoryConsoleTab = "preview";
  stateRef.current.chatId = "chat";
  stateRef.current.memoryPreviewDraft = "draft";
  jest.mocked(previewMemoryContext).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await render(React.createElement(MemoryInfoConsole));
  await act(async () => preview().onPreview());
  await act(async () => preview().onPreview());
  await settle(current, { data: { message: "current" } });
  await settle(old, { data: { message: "old" } });
  expect(stateRef.current.memoryPreviewResult?.message).toBe("current");

  const previousChat = deferred();
  jest.mocked(previewMemoryContext).mockReturnValueOnce(previousChat.promise);
  await act(async () => preview().onPreview());
  stateRef.current.chatId = "new-chat";
  await render(React.createElement(MemoryInfoConsole));
  await settle(previousChat, { data: { message: "previous-chat" } });
  expect(stateRef.current.memoryPreviewResult).toBeNull();
  expect(stateRef.current.memoryPreviewLoading).toBe(false);
});

/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ViewEmbed, clampViewHeight } from "./ViewEmbed";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mockGetView = jest.fn();
const mockQueryView = jest.fn();
const mockInvokeView = jest.fn();
jest.mock("@/shared/data", () => ({
  getView: (...args: unknown[]) => mockGetView(...args),
  queryView: (...args: unknown[]) => mockQueryView(...args),
  invokeView: (...args: unknown[]) => mockInvokeView(...args),
  createRequestId: () => "view-write-0001",
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (key: string) => key }) }));
const mockDispatch = jest.fn();
let mockViewPreviews: any[] = [];
jest.mock("@/app/state/provider", () => ({ useOptionalAppContext: () => ({
  state: { themeMode: "dark", viewPreviews: mockViewPreviews }, dispatch: mockDispatch,
}) }));

const hash = "a".repeat(64);
const view = { source: "connector" as const, connectorId: "builtin.task-control", key: "automations", hash, renderer: "html" as const };

async function mount(props: Partial<React.ComponentProps<typeof ViewEmbed>>, workspace = false) {
  mockGetView.mockResolvedValue({ data: { view, html: "<p>x</p>", queries: { list: { adapter: "native", operation: "automation.list" } }, actions: { update: { adapter: "cli", description: "Update issue", args: ["update"] } } } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const posted: unknown[] = [];
  const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")!.get!;
  const tracked = new WeakSet<Window>();
  // Install before rendering: jsdom may dispatch the iframe load during act().
  const windowGetter = jest.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (this: HTMLIFrameElement) {
    const target = original.call(this) as Window | null;
    if (target && !tracked.has(target)) {
      tracked.add(target);
      jest.spyOn(target, "postMessage").mockImplementation(((message: unknown) => { posted.push(message); }) as never);
    }
    return target;
  });
  const render = (next = props) => {
    root.render(<ViewEmbed chatId="chat" view={view} payloadRaw='{"limit":5}' allowSidebar={workspace} {...next} />);
  };
  await act(async () => render());
  const frame = host.querySelector("iframe")!;
  await act(async () => { frame.dispatchEvent(new Event("load")); });
  return { host, frame, posted, render, cleanup: () => { act(() => root.unmount()); windowGetter.mockRestore(); host.remove(); } };
}

afterEach(() => { mockGetView.mockReset(); mockQueryView.mockReset(); mockInvokeView.mockReset(); mockDispatch.mockReset(); mockViewPreviews = []; });

test("query blocks run the initial query with the publishing Run and pass host context", async () => {
  mockQueryView.mockResolvedValue({ data: { data: { items: [{ id: "daily" }] }, executedAt: 1700000000000 } });
  const { posted, cleanup } = await mount({ runId: "run-1", query: "list" });
  try {
    expect(mockQueryView).toHaveBeenCalledWith({ chatId: "chat", runId: "run-1", view: { connectorId: "builtin.task-control", key: "automations", hash }, query: "list", params: { limit: 5 } });
    expect(posted[0]).toMatchObject({ type: "view_init", data: { payload: { items: [{ id: "daily" }] }, context: { queryable: true, colorScheme: "dark", locale: "zh-CN", executedAt: 1700000000000, query: { name: "list", params: { limit: 5 } } } } });
  } finally { cleanup(); }
});

test("frame queries are answered only for the own frame and declared queries", async () => {
  mockQueryView.mockResolvedValue({ data: { data: { items: [] }, executedAt: 1700000000000 } });
  const { frame, posted, cleanup } = await mount({ runId: "run-1", payloadRaw: '{"items":[]}' });
  try {
    expect(mockQueryView).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "view_query", id: "x", query: "list", params: {} } })); });
    expect(mockQueryView).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, data: { type: "view_query", id: "q1", query: "delete", params: {} } })); });
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, data: { type: "view_query", id: "q2", query: "list", params: { offset: 20 } } })); });
    expect(mockQueryView).toHaveBeenCalledTimes(1);
    expect(posted).toEqual(expect.arrayContaining([
      { type: "view_query_result", id: "q1", ok: false, error: "view_query_unavailable" },
      { type: "view_query_result", id: "q2", ok: true, data: { items: [] }, executedAt: 1700000000000 },
    ]));
  } finally { cleanup(); }
});

test("a newer query with the same name supersedes the older one", async () => {
  const pending: Array<(value: unknown) => void> = [];
  mockQueryView.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const { frame, posted, cleanup } = await mount({ runId: "run-1", payloadRaw: '{"items":[]}' });
  try {
    const ask = (id: string, query: string, offset: number) => act(async () => {
      window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, data: { type: "view_query", id, query, params: { offset } } }));
    });
    await ask("old", "list", 0);
    await ask("new", "list", 20);
    expect(pending).toHaveLength(2);
    await act(async () => { pending[1]({ data: { data: { page: 2 }, executedAt: 2 } }); });
    await act(async () => { pending[0]({ data: { data: { page: 1 }, executedAt: 1 } }); });
    expect(posted).toEqual(expect.arrayContaining([
      { type: "view_query_result", id: "new", ok: true, data: { page: 2 }, executedAt: 2 },
      { type: "view_query_result", id: "old", ok: false, error: "view_query_superseded" },
    ]));
  } finally { cleanup(); }
});

test("without a Run the view is not queryable", async () => {
  const { posted, cleanup } = await mount({ payloadRaw: '{"items":[]}' });
  try {
    expect(posted[0]).toMatchObject({ type: "view_init", data: { context: { queryable: false } } });
  } finally { cleanup(); }
});

test("height has a floor but no ceiling", () => {
  expect(clampViewHeight(10)).toBe(48);
  expect(clampViewHeight(5000.2)).toBe(5001);
  expect(clampViewHeight("x")).toBeUndefined();
});

async function request(frame: HTMLIFrameElement, id: string) {
  await act(async () => { window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, data: { type: "view_query", id, query: "list", params: {} },
  })); });
}

test("message data has an accessible header and records later query success and failure", async () => {
  mockQueryView.mockResolvedValueOnce({ data: { data: { items: [] }, executedAt: 1700000000000 } });
  const { host, frame, cleanup } = await mount({ runId: "run-1" });
  try {
    const header = host.querySelector(".view-header")!;
    expect(header.textContent).toContain("view.header.message");
    expect(header.querySelector("details")).toBeNull();
    expect(header.querySelector("time")).toBeNull();
    await request(frame, "q1");
    expect(header.textContent).toContain("view.header.updated");
    expect(header.querySelector("time")?.getAttribute("datetime")).toBeTruthy();
    mockQueryView.mockRejectedValueOnce(new Error("offline"));
    await request(frame, "q2");
    expect(header.textContent).toContain("view.header.updateFailed");
    expect(header.textContent).toContain("view.header.lastSuccess");
    expect(header.textContent).toContain("view.header.message");
    mockQueryView.mockResolvedValueOnce({ data: { data: { items: [] }, executedAt: 1700000000000 } });
    await request(frame, "q3");
    expect(header.textContent).toContain("view.header.updated");
    expect(header.textContent).not.toContain("view.header.updateFailed");
  } finally { cleanup(); }
});

test("dynamic queries show pending and failed states, then a successful retry", async () => {
  let reject!: (error: Error) => void;
  mockQueryView.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const { host, frame, cleanup } = await mount({ runId: "run-1", query: "list" });
  try {
    const header = host.querySelector(".view-header")!;
    expect(header.textContent).toContain("view.header.dynamic");
    expect(header.textContent).toContain("view.header.querying");
    await act(async () => { reject(new Error("offline")); });
    expect(header.textContent).toContain("view.header.queryFailed");
    expect(header.querySelector("time")).toBeNull();
    mockQueryView.mockResolvedValueOnce({ data: { data: { items: [] }, executedAt: 1700000000000 } });
    await request(frame, "retry");
    expect(header.querySelector("time")).not.toBeNull();
    expect(header.textContent).not.toContain("view.header.queryFailed");
  } finally { cleanup(); }
});

test("concurrent queries keep the pending indicator until all requests settle", async () => {
  let resolveFirst!: (value: unknown) => void;
  let resolveSecond!: (value: unknown) => void;
  mockQueryView.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
  const { host, frame, cleanup } = await mount({ runId: "run-1" });
  try {
    await request(frame, "q1");
    await request(frame, "q2");
    await act(async () => { resolveSecond({ data: { data: {}, executedAt: 1700000000000 } }); });
    expect(host.querySelector(".view-header")?.textContent).toContain("view.header.querying");
    await act(async () => { resolveFirst({ data: { data: {}, executedAt: 1700000000000 } }); });
    expect(host.querySelector(".view-header")?.textContent).not.toContain("view.header.querying");
    expect(host.querySelector(".view-header")?.textContent).toContain("view.header.updated");
  } finally { cleanup(); }
});

test("template errors still have a header and raw data fallback", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<ViewEmbed chatId="chat" view={view} payloadRaw="{}" rawData="original" query="list" viewError="view_not_found" />));
  try {
    expect(host.querySelector(".view-header")?.textContent).toContain("view.header.dynamic");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector("pre")?.textContent).toBe("original");
  } finally { act(() => root.unmount()); }
});

test("switching Chats clears query state and ignores the previous Chat's response", async () => {
  let resolve!: (value: unknown) => void;
  mockQueryView.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  mockGetView.mockResolvedValue({ data: { view, html: "<p>x</p>", queries: { list: { adapter: "native", operation: "automation.list" } }, actions: { update: { adapter: "cli", description: "Update issue", args: ["update"] } } } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ViewEmbed chatId="first" view={view} payloadRaw="{}" runId="run-1" query="list" />));
  await act(async () => { host.querySelector("iframe")!.dispatchEvent(new Event("load")); });
  try {
    expect(host.querySelector(".view-header")?.textContent).toContain("view.header.querying");
    await act(async () => root.render(<ViewEmbed chatId="second" view={view} payloadRaw="{}" runId="run-2" />));
    await act(async () => { resolve({ data: { data: { items: ["old"] }, executedAt: 1700000000000 } }); });
    expect(host.querySelector(".view-header")?.textContent).toContain("view.header.message");
    expect(host.querySelector(".view-header")?.textContent).not.toContain("view.header.querying");
    expect(host.querySelector("time")).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); }
});

test("expand opens a larger dialog with the same frozen view and saved data", async () => {
  const { host, cleanup } = await mount({ payloadRaw: '{"items":[{"id":"saved"}]}' });
  try {
    const button = host.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("view.header.title");
    expect(dialog.querySelector(".ant-modal-header")).toBeNull();
    expect(dialog.querySelectorAll(".view-header")).toHaveLength(1);
    expect(dialog.querySelector("iframe")).not.toBeNull();
    expect(dialog.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
    expect(mockGetView).toHaveBeenCalledTimes(2);
    expect(mockGetView.mock.calls[1][0]).toMatchObject({ chatId: "chat", connectorId: view.connectorId, key: view.key, hash });
    expect(mockQueryView).not.toHaveBeenCalled();
    expect(host.querySelector("iframe")).not.toBeNull();
    await act(async () => { (dialog.querySelector('button[aria-label="view.header.close"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[role="dialog"] iframe')).toBeNull();
    expect(host.querySelector("iframe")).not.toBeNull();
  } finally { cleanup(); }
});

test("expanded dynamic views query with the same Run and initial parameters", async () => {
  mockQueryView.mockResolvedValue({ data: { data: { items: [] }, executedAt: 1700000000000 } });
  const { host, cleanup } = await mount({ runId: "run-1", query: "list" });
  try {
    const initialCalls = mockQueryView.mock.calls.length;
    await act(async () => { (host.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click(); });
    const frame = document.querySelector('[role="dialog"] iframe')!;
    await act(async () => { frame.dispatchEvent(new Event("load")); });
    expect(mockQueryView).toHaveBeenCalledTimes(initialCalls + 1);
    expect(mockQueryView.mock.calls.at(-1)[0]).toMatchObject({ chatId: "chat", runId: "run-1", view: { hash }, query: "list", params: { limit: 5 } });
    expect(document.querySelector('[role="dialog"] time')).not.toBeNull();
  } finally { cleanup(); }
});


test("query time opens the explanation in a popover without a separate information row", async () => {
  mockQueryView.mockResolvedValue({ data: { data: { items: [] }, executedAt: 1700000000000 } });
  const { host, cleanup } = await mount({ runId: "run-1", query: "list" });
  try {
    const header = host.querySelector(".view-header")!;
    expect(header.textContent).toContain("view.header.title");
    expect(header.querySelector("details")).toBeNull();
    expect(document.body.textContent).not.toContain("view.header.dynamicHelp");
    const time = header.querySelector(".view-query-time") as HTMLButtonElement;
    expect(time.querySelector("time")).not.toBeNull();
    expect(time.parentElement).toBe(header.lastElementChild);
    await act(async () => { time.click(); });
    expect(document.querySelector(".ant-popover")?.textContent).toContain("view.header.dynamicHelp");
  } finally { cleanup(); }
});

test("sidebar action opens a tab with the same frozen view, after the dialog button", async () => {
  const { host, render, cleanup } = await mount({ runId: "run-1", query: "list" }, true);
  try {
    const dialog = host.querySelector('button[aria-haspopup="dialog"]')!;
    const sidebar = host.querySelector('button[aria-label="view.header.openSidebar"]') as HTMLButtonElement;
    expect(dialog.nextElementSibling).toBe(sidebar);
    await act(async () => sidebar.click());
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: "OPEN_VIEW_PREVIEW", preview: expect.objectContaining({
      chatId: "chat", runId: "run-1", view, query: "list", payloadRaw: '{"limit":5}',
    }) });
    expect(document.querySelector("aside")).toBeNull();
    mockViewPreviews = [mockDispatch.mock.calls.at(-1)[0].preview];
    await act(async () => render({ runId: "run-1", query: "list", payloadRaw: '{"limit":10}' }));
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: "UPDATE_VIEW_PREVIEW", preview: expect.objectContaining({ payloadRaw: '{"limit":10}' }) });
  } finally { cleanup(); }
});


test("viewer writes require own frame, declaration and trusted host confirmation", async () => {
  mockInvokeView.mockResolvedValue({ data: { data: { applied: true }, executedAt: 42, invocationId: "call-1", exitCode: 0 } });
  const { frame, posted, cleanup } = await mount({ runId: "run-1", payloadRaw: '{}' });
  const send = async (source: Window | null, action = "update", id = "a1") => {
    await act(async () => { window.dispatchEvent(new MessageEvent("message", { source, data: { type: "view_invoke", id, action, params: { key: "DEMO-1" } } })); });
  };
  try {
    await send(window); expect(mockInvokeView).not.toHaveBeenCalled();
    await send(frame.contentWindow, "delete", "bad"); expect(posted).toContainEqual(expect.objectContaining({ type: "view_invoke_result", id: "bad", error: "view_action_unavailable" }));
    await send(frame.contentWindow);
    expect(mockInvokeView).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("DEMO-1");
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === "view.action.submit")!;
    await act(async () => button.click());
    expect(mockInvokeView).toHaveBeenCalledTimes(1);
    expect(mockInvokeView).toHaveBeenCalledWith({ chatId: "chat", runId: "run-1", view: { connectorId: view.connectorId, key: view.key, hash }, action: "update", params: { key: "DEMO-1" }, requestId: "view-write-0001" });
    expect(posted).toContainEqual(expect.objectContaining({ type: "view_invoke_result", id: "a1", ok: true, exitCode: 0, invocationId: "call-1" }));
    await send(frame.contentWindow, "update", "a2");
    const cancel = [...document.querySelectorAll('button')].find(b => b.textContent === "view.action.cancel")!;
    await act(async () => cancel.click());
    expect(mockInvokeView).toHaveBeenCalledTimes(1);
    expect(posted).toContainEqual(expect.objectContaining({ id: "a2", error: "view_action_canceled" }));
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  } finally { cleanup(); }
});

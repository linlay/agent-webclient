/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ViewEmbed, clampViewHeight } from "./ViewEmbed";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mockGetView = jest.fn();
const mockQueryView = jest.fn();
jest.mock("@/shared/data", () => ({
  getView: (...args: unknown[]) => mockGetView(...args),
  queryView: (...args: unknown[]) => mockQueryView(...args),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (key: string) => key }) }));
jest.mock("@/app/state/provider", () => ({ useOptionalAppContext: () => ({ state: { themeMode: "dark" } }) }));

const hash = "a".repeat(64);
const view = { source: "connector" as const, connectorId: "builtin.task-control", key: "automations", hash, renderer: "html" as const };

async function mount(props: Partial<React.ComponentProps<typeof ViewEmbed>>) {
  mockGetView.mockResolvedValue({ data: { view, html: "<p>x</p>", queries: { list: { adapter: "native", operation: "automation.list" } } } });
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
  await act(async () => root.render(<ViewEmbed chatId="chat" view={view} payloadRaw='{"limit":5}' {...props} />));
  const frame = host.querySelector("iframe")!;
  await act(async () => { frame.dispatchEvent(new Event("load")); });
  return { host, frame, posted, cleanup: () => { act(() => root.unmount()); windowGetter.mockRestore(); host.remove(); } };
}

afterEach(() => { mockGetView.mockReset(); mockQueryView.mockReset(); });

test("query blocks run the initial query with the publishing Run and pass host context", async () => {
  mockQueryView.mockResolvedValue({ data: { result: { items: [{ id: "daily" }] } } });
  const { posted, cleanup } = await mount({ runId: "run-1", query: "list" });
  try {
    expect(mockQueryView).toHaveBeenCalledWith({ chatId: "chat", runId: "run-1", view: { connectorId: "builtin.task-control", key: "automations", hash }, query: "list", params: { limit: 5 } });
    expect(posted[0]).toMatchObject({ type: "view_init", data: { payload: { items: [{ id: "daily" }] }, context: { queryable: true, colorScheme: "dark", locale: "zh-CN", query: { name: "list", params: { limit: 5 } } } } });
  } finally { cleanup(); }
});

test("frame queries are answered only for the own frame and declared queries", async () => {
  mockQueryView.mockResolvedValue({ data: { result: { items: [] } } });
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
      { type: "view_query_result", id: "q2", ok: true, result: { items: [] } },
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
  mockQueryView.mockResolvedValueOnce({ data: { result: { items: [] } } });
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
    mockQueryView.mockResolvedValueOnce({ data: { result: { items: [] } } });
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
    mockQueryView.mockResolvedValueOnce({ data: { result: { items: [] } } });
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
    await act(async () => { resolveSecond({ data: { result: {} } }); });
    expect(host.querySelector(".view-header")?.textContent).toContain("view.header.querying");
    await act(async () => { resolveFirst({ data: { result: {} } }); });
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
  mockGetView.mockResolvedValue({ data: { view, html: "<p>x</p>", queries: { list: { adapter: "native", operation: "automation.list" } } } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ViewEmbed chatId="first" view={view} payloadRaw="{}" runId="run-1" query="list" />));
  await act(async () => { host.querySelector("iframe")!.dispatchEvent(new Event("load")); });
  try {
    expect(host.querySelector(".view-header")?.textContent).toContain("view.header.querying");
    await act(async () => root.render(<ViewEmbed chatId="second" view={view} payloadRaw="{}" runId="run-2" />));
    await act(async () => { resolve({ data: { result: { items: ["old"] } } }); });
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
  mockQueryView.mockResolvedValue({ data: { result: { items: [] } } });
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
  mockQueryView.mockResolvedValue({ data: { result: { items: [] } } });
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

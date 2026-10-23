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
  await act(async () => root.render(<ViewEmbed chatId="chat" view={view} payloadRaw='{"limit":5}' {...props} />));
  const frame = host.querySelector("iframe")!;
  const posted: unknown[] = [];
  jest.spyOn(frame.contentWindow!, "postMessage").mockImplementation(((message: unknown) => { posted.push(message); }) as never);
  await act(async () => { frame.dispatchEvent(new Event("load")); });
  return { host, frame, posted, cleanup: () => { act(() => root.unmount()); host.remove(); } };
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

test("height is clamped", () => {
  expect(clampViewHeight(10)).toBe(48);
  expect(clampViewHeight(5000)).toBe(1600);
  expect(clampViewHeight("x")).toBeUndefined();
});

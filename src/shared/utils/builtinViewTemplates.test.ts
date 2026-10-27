/** @jest-environment jsdom */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { VIEW_DISPLAY_SDK } from "./viewDocument";

// Platform-owned builtin VIEW templates, exercised against the host SDK. The
// split catalog views use shared assets and are covered by Platform's own
// jsdom test (internal/view/testdata/catalog_lists.cjs).
const platform = process.env.AGENT_PLATFORM_SOURCE || path.resolve(__dirname, "../../../../agent-platform");
const templates = {
  automations: path.join(platform, "internal/resources/connectors/builtin.task-control/views/automations.html"),
};
const available = existsSync(templates.automations);
const maybe = available ? describe : describe.skip;

function load(file: string) {
  const parsed = new DOMParser().parseFromString(readFileSync(file, "utf8"), "text/html");
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const posted: Array<Record<string, any>> = [];
  window.postMessage = ((message: Record<string, any>) => { posted.push(message); }) as typeof window.postMessage;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => { callback(0); return 1; }) as typeof window.requestAnimationFrame;
  new Function(VIEW_DISPLAY_SDK)();
  for (const script of Array.from(parsed.querySelectorAll("script"))) new Function(script.textContent || "")();
  const send = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { source: window, data }));
  const answer = (result: unknown) => {
    const request = posted.filter((message) => message.type === "view_query").pop()!;
    send({ type: "view_query_result", id: request.id, ok: true, data: result, executedAt: 1700000000000 });
    return request;
  };
  return { posted, send, answer };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

maybe("builtin VIEW templates", () => {
  // Each test loads another SDK into the same jsdom window; listeners of earlier
  // templates then fail on the replaced DOM. Real views each own an iframe.
  beforeEach(() => { jest.spyOn(console, "error").mockImplementation(() => undefined); });
  afterEach(() => { jest.restoreAllMocks(); });
  test("automations queries its first page from the block input, then pages", async () => {
    const { send, answer, posted } = load(templates.automations);
    send({ type: "view_init", data: { payload: { limit: 20 }, context: { queryable: true, locale: "en" } } });
    const first = answer({ items: [{ id: "a", name: "Daily report", cron: "0 9 * * *", enabled: true, agentKey: "writer", nextFireTime: "09:00", lastExecution: { status: "failed", startedTime: "08:00" } }], total: 30, hasMore: true });
    expect(first).toMatchObject({ query: "list", params: { limit: 20, offset: 0 } });
    await flush();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(document.body.textContent).toContain("Daily report");
    expect(document.querySelector(".failed")?.textContent).toContain("failed");
    send({ type: "view_update", data: { payload: { limit: 20 }, context: { queryable: true, locale: "zh-CN" } } });
    expect(posted.filter((message) => message.type === "view_query")).toHaveLength(1);
    (document.getElementById("next") as HTMLButtonElement).click();
    const request = answer({ items: [], total: 30, hasMore: false });
    expect(request).toMatchObject({ query: "list", params: { limit: 20, offset: 20 } });
    await flush();
    expect(document.body.textContent).toContain("暂无自动化");
    expect((document.getElementById("prev") as HTMLButtonElement).disabled).toBe(false);
  });

  test("automations without query support explains it and never queries", () => {
    const { send, posted } = load(templates.automations);
    send({ type: "view_init", data: { payload: {}, context: { queryable: false, locale: "zh-CN" } } });
    expect(document.getElementById("pager")?.hidden).toBe(true);
    (document.getElementById("refresh") as HTMLButtonElement).click();
    expect(posted.some((message) => message.type === "view_query")).toBe(false);
    expect(document.body.textContent).toContain("无法查询");
  });
});

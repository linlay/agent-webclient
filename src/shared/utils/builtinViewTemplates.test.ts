/** @jest-environment jsdom */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { VIEW_DISPLAY_SDK } from "./viewDocument";

// Platform-owned builtin VIEW templates, exercised against the host SDK.
const platform = process.env.AGENT_PLATFORM_SOURCE || path.resolve(__dirname, "../../../../agent-platform");
const templates = {
  automations: path.join(platform, "internal/resources/connectors/builtin.task-control/views/automations.html"),
  catalog: path.join(platform, "internal/resources/connectors/builtin.platform-control/views/catalog.html"),
};
const available = existsSync(templates.automations) && existsSync(templates.catalog);
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
    send({ type: "view_query_result", id: request.id, ok: true, result });
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
  test("automations renders rows and pages through the query", async () => {
    const { send, answer } = load(templates.automations);
    send({ type: "view_init", data: { payload: { items: [{ id: "a", name: "Daily report", cron: "0 9 * * *", enabled: true, agentKey: "writer", nextFireTime: "09:00", lastExecution: { status: "failed", startedTime: "08:00" } }], total: 30, hasMore: true, nextOffset: 20 }, context: { queryable: true, locale: "en", query: { name: "list", params: { limit: 20 } } } } });
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(document.body.textContent).toContain("Daily report");
    expect(document.querySelector(".failed")?.textContent).toContain("failed");
    (document.getElementById("next") as HTMLButtonElement).click();
    const request = answer({ items: [], total: 30, hasMore: false, nextOffset: 30 });
    expect(request).toMatchObject({ query: "list", params: { limit: 20, offset: 20 } });
    await flush();
    expect(document.body.textContent).toContain("No automations");
    expect((document.getElementById("prev") as HTMLButtonElement).disabled).toBe(false);
  });

  test("automations without query support stays static", () => {
    const { send, posted } = load(templates.automations);
    send({ type: "view_init", data: { payload: { items: [] }, context: { queryable: false, locale: "zh-CN" } } });
    expect(document.getElementById("pager")?.hidden).toBe(true);
    (document.getElementById("refresh") as HTMLButtonElement).click();
    expect(posted.some((message) => message.type === "view_query")).toBe(false);
    expect(document.body.textContent).toContain("暂无自动化");
  });

  test("catalog switches resource type and pages by cursor", async () => {
    const { send, answer } = load(templates.catalog);
    send({ type: "view_init", data: { payload: { items: [{ resourceKey: "writer", resourceType: "agent", valid: true, name: "Writer", mode: "GENERAL", invocable: true }], total: 1, hasMore: false, nextCursor: "" }, context: { queryable: true, locale: "en", query: { name: "list", params: { resourceType: "agent" } } } } });
    expect(document.body.textContent).toContain("Writer");
    (document.querySelector('[data-type="connector"]') as HTMLButtonElement).click();
    const request = answer({ items: [{ resourceKey: "crm", resourceType: "connector", valid: false, hasMcp: true, diagnostics: [{ message: "bad manifest" }] }], total: 2, hasMore: true, nextCursor: "crm" });
    expect(request.params).toMatchObject({ resourceType: "connector", status: "all" });
    expect(request.params.cursor).toBeUndefined();
    await flush();
    expect(document.body.textContent).toContain("bad manifest");
    (document.getElementById("next") as HTMLButtonElement).click();
    const next = answer({ items: [], total: 2, hasMore: false, nextCursor: "" });
    expect(next.params).toMatchObject({ resourceType: "connector", cursor: "crm" });
  });
});

import { buildProjectRoute, readProjectRouteState } from "./projectRoute";

describe("project route", () => {
  it("round trips project selection state", () => {
    const route = buildProjectRoute({
      agentKey: "coder one",
      chatId: "chat-1",
      runId: "run-2",
      path: "src/app.tsx",
      openFiles: ["README.md", "src/app.tsx"],
      view: "diff",
    });
    expect(readProjectRouteState(route.split("?", 2)[1] || "")).toEqual({
      agentKey: "coder one",
      chatId: "chat-1",
      runId: "run-2",
      path: "src/app.tsx",
      openFiles: ["README.md", "src/app.tsx"],
      view: "diff",
    });
  });

  it("deduplicates persisted open file tabs", () => {
    const route = buildProjectRoute({
      agentKey: "coder",
      path: "b.ts",
      openFiles: ["a.ts", "b.ts", "a.ts"],
      view: "content",
    });
    expect(route).toContain("open=a.ts&open=b.ts");
    expect(readProjectRouteState(route.split("?", 2)[1] || "").openFiles).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });

  it("defaults to content view and omits empty values", () => {
    expect(buildProjectRoute({ agentKey: "coder", view: "content" })).toBe(
      "/project?agentKey=coder&view=content",
    );
    expect(readProjectRouteState("?agentKey=coder&view=unknown").view).toBe(
      "content",
    );
  });
});

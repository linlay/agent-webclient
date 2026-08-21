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
    expect(route).toContain("/project/coder%20one?");
    expect(readProjectRouteState(route.split("?", 2)[1] || "", "coder one")).toEqual({
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
    expect(readProjectRouteState(route.split("?", 2)[1] || "", "coder").openFiles).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });

  it("defaults to content view and omits empty values", () => {
    expect(buildProjectRoute({ agentKey: "coder", view: "content" })).toBe(
      "/project/coder",
    );
    expect(readProjectRouteState("?view=unknown", "coder").view).toBe(
      "content",
    );
    expect(buildProjectRoute({ view: "content" })).toBe("");
  });
});

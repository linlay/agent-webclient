import {
  closeProjectTab,
  openProjectTab,
} from "@/features/project/lib/projectTabs";

describe("project tabs", () => {
  it("opens each file once and keeps its order", () => {
    expect(openProjectTab(["src/a.ts"], "src/b.ts")).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(openProjectTab(["src/a.ts"], "src/a.ts")).toEqual(["src/a.ts"]);
  });

  it("selects the neighboring tab when the active file closes", () => {
    expect(closeProjectTab(["a", "b", "c"], "b", "b")).toEqual({
      paths: ["a", "c"],
      activePath: "c",
    });
    expect(closeProjectTab(["a", "b"], "b", "b")).toEqual({
      paths: ["a"],
      activePath: "a",
    });
  });

  it("does not change the active file when a background tab closes", () => {
    expect(closeProjectTab(["a", "b"], "a", "b")).toEqual({
      paths: ["a"],
      activePath: "a",
    });
  });
});

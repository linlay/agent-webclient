import { projectRefreshVisible, resolveProjectInvalidation } from "./projectRefresh";

describe("project refresh", () => {
  it("invalidates only loaded parent directories and the selected file", () => {
    expect(resolveProjectInvalidation(
      ["/workspace/internal/server/project.go", "docs/new.md"],
      ["", "internal", "internal/server", "docs", "other"],
      "internal/server/project.go",
    )).toEqual({
      directories: ["internal/server", "docs"],
      selectedChanged: true,
    });
  });

  it("falls back to the root for an unmatched absolute event path", () => {
    expect(resolveProjectInvalidation(
      ["C:\\workspace\\new.txt"],
      ["", "src"],
      "src/App.tsx",
    )).toEqual({ directories: [""], selectedChanged: false });
  });

  it("pauses polling while the page is hidden", () => {
    expect(projectRefreshVisible("visible")).toBe(true);
    expect(projectRefreshVisible("hidden")).toBe(false);
  });
});

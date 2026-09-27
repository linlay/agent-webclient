import { skillDisplayName } from "./skillDisplayName";

describe("skillDisplayName", () => {
  it("prefers localized display metadata over the legacy name and stable key", () => {
    expect(skillDisplayName({ key: "workflow", displayName: " 工作流 ", name: "old-name" })).toBe("工作流");
    expect(skillDisplayName({ key: "workflow", displayName: "Workflow" })).toBe("Workflow");
  });

  it("supports legacy responses and ignores blank display metadata", () => {
    expect(skillDisplayName({ key: "workflow", displayName: " ", name: " Legacy " })).toBe("Legacy");
    expect(skillDisplayName({ key: "workflow", name: " " })).toBe("workflow");
    expect(skillDisplayName({})).toBe("");
  });
});

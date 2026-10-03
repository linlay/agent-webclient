import { skillDisplayName, skillPackageDisplayName } from "./skillDisplayName";

describe("skillDisplayName", () => {
  it("prefers localized display metadata over the legacy name and stable id", () => {
    expect(skillDisplayName({ id: "workflow", displayName: " 工作流 ", name: "old-name" })).toBe("工作流");
    expect(skillDisplayName({ id: "workflow", displayName: "Workflow" })).toBe("Workflow");
  });

  it("supports legacy responses and ignores blank display metadata", () => {
    expect(skillDisplayName({ id: "workflow", displayName: " ", name: " Legacy " })).toBe("Legacy");
    expect(skillDisplayName({ id: "workflow", name: " " })).toBe("");
    expect(skillDisplayName({})).toBe("");
  });
});

it("does not use skill or package ids as display names", () => {
  expect(skillDisplayName({ id: "internal-id" })).toBe("");
  expect(skillPackageDisplayName({ id: "internal-id" })).toBe("");
  expect(skillPackageDisplayName({ id: "internal-id", name: "Package" })).toBe("Package");
});

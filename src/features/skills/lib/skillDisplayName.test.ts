import { resolveSkillDisplayName } from "./skillDisplayName";

describe("resolveSkillDisplayName", () => {
  const skills = [
    {
      id: "skill-creator",
      displayName: "技能创建",
      configured: true,
    },
  ];

  it("uses the name declared by the active skills center", () => {
    expect(resolveSkillDisplayName(skills, "skill-creator")).toBe("技能创建");
    expect(resolveSkillDisplayName(skills, "SKILL-CREATOR")).toBe("技能创建");
  });

  it("falls back to an existing label without displaying the stable id", () => {
    expect(resolveSkillDisplayName([], "skill-creator", "Skill Creator")).toBe(
      "Skill Creator",
    );
    expect(resolveSkillDisplayName([], "skill-creator")).toBe("");
  });
});

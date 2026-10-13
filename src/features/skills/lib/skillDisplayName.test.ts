import { resolveSkillDisplayName, resolveSkillIconUrl } from "./skillDisplayName";

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

describe("resolveSkillIconUrl", () => {
  const skills = [
    {
      id: "skill-creator",
      displayName: "技能创建",
      icon: "/api/skills/icon?agentKey=demo&id=skill-creator",
      configured: true,
    },
    {
      id: "iconless",
      displayName: "无头像技能",
      configured: true,
    },
  ];

  it("resolves the skill avatar url by case-insensitive id", () => {
    expect(resolveSkillIconUrl(skills, "skill-creator")).toBe(
      "/api/skills/icon?agentKey=demo&id=skill-creator",
    );
    expect(resolveSkillIconUrl(skills, "SKILL-CREATOR")).toBe(
      "/api/skills/icon?agentKey=demo&id=skill-creator",
    );
  });

  it("returns empty for missing, iconless or blank-id skills", () => {
    expect(resolveSkillIconUrl(skills, "iconless")).toBe("");
    expect(resolveSkillIconUrl(skills, "missing")).toBe("");
    expect(resolveSkillIconUrl(skills, "")).toBe("");
    expect(resolveSkillIconUrl(skills, "  ")).toBe("");
  });
});

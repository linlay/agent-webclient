import {
  buildAgentSkillLabelMap,
  resolveAgentSkillLabel,
} from "./AgentSkillLabelsProvider";

describe("AgentSkillLabelsProvider", () => {
  it("resolves a stable skill key to its catalog display name", () => {
    const labels = buildAgentSkillLabelMap([
      {
        key: "skill-creator",
        name: "技能创建",
        agentHasSkill: true,
      },
    ]);

    expect(resolveAgentSkillLabel(labels, "skill-creator")).toBe("技能创建");
    expect(resolveAgentSkillLabel(labels, "SKILL-CREATOR")).toBe("技能创建");
  });

  it("falls back to an existing label and then the stable key", () => {
    const labels = buildAgentSkillLabelMap([]);

    expect(
      resolveAgentSkillLabel(labels, "skill-creator", "Skill Creator"),
    ).toBe("Skill Creator");
    expect(resolveAgentSkillLabel(labels, "skill-creator")).toBe(
      "skill-creator",
    );
  });
});

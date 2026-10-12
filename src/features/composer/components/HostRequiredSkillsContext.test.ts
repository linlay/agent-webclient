import { readHostRequiredSkills } from "@/features/composer/components/HostRequiredSkillsContext";

describe("readHostRequiredSkills", () => {
  it("reads and case-insensitively deduplicates repeated host skill params", () => {
    const params = new URLSearchParams();
    params.append("reference", JSON.stringify({type:"skill",id:"poster-studio"}));
    params.append("reference", JSON.stringify({type:"skill",id:"poster-studio"}));
    params.append("reference", JSON.stringify({type:"skill",id:"../unsafe"}));
    expect(readHostRequiredSkills("webOperator", params)).toEqual({
      agentKey: "webOperator",
      skills: ["poster-studio"],
    });
  });

  it("ignores host skills without a scoped Copilot agent", () => {
    expect(
      readHostRequiredSkills("", new URLSearchParams("unexpectedOption=poster-studio")),
    ).toEqual({ agentKey: "", skills: [] });
  });
});

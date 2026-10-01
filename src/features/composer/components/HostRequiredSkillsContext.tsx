import React, { createContext, useContext } from "react";

export type HostRequiredSkills = {
  agentKey: string;
  skills: string[];
};

const EMPTY_HOST_REQUIRED_SKILLS: HostRequiredSkills = Object.freeze({
  agentKey: "",
  skills: [],
});

const HostRequiredSkillsContext = createContext<HostRequiredSkills>(
  EMPTY_HOST_REQUIRED_SKILLS,
);

export function readHostRequiredSkills(
  agentKey: string,
  searchParams: URLSearchParams,
): HostRequiredSkills {
  const normalizedAgentKey = String(agentKey || "").trim();
  if (!normalizedAgentKey) return EMPTY_HOST_REQUIRED_SKILLS;
  const identities = new Set<string>();
  const skills: string[] = [];
  for (const value of searchParams.getAll("mustUseSkill")) {
    const skillId = value.trim();
    const identity = skillId.toLowerCase();
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(skillId) || identities.has(identity)) {
      continue;
    }
    identities.add(identity);
    skills.push(skillId);
    if (skills.length >= 16) break;
  }
  return skills.length > 0
    ? { agentKey: normalizedAgentKey, skills }
    : EMPTY_HOST_REQUIRED_SKILLS;
}

export const HostRequiredSkillsProvider: React.FC<
  React.PropsWithChildren<HostRequiredSkills>
> = ({ agentKey, skills, children }) => (
  <HostRequiredSkillsContext.Provider value={{ agentKey, skills }}>
    {children}
  </HostRequiredSkillsContext.Provider>
);

export function useHostRequiredSkills() {
  return useContext(HostRequiredSkillsContext);
}

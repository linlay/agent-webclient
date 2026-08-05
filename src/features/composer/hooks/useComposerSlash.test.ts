import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useComposerSlash } from "@/features/composer/hooks/useComposerSlash";

const useAgentSkillsQueryMock = jest.fn();

jest.mock("@/shared/data/query/queries", () => ({
  useAgentSkillsQuery: (...args: unknown[]) => useAgentSkillsQueryMock(...args),
}));

function renderSlashHook(input: { inputValue: string; currentAgentKey: string }) {
  let result: ReturnType<typeof useComposerSlash> | null = null;
  const Harness = () => {
    result = useComposerSlash({
      composerPillRef: React.createRef(),
      composerRef: React.createRef(),
      inputValue: input.inputValue,
      currentAgentKey: input.currentAgentKey,
      isAwaitingActive: false,
      isFrontendActive: false,
      isVoiceMode: false,
      commandOverlayOpen: false,
      canUsePlanningMode: false,
      canUseEditingMode: false,
      addMenuOpen: false,
    });
    return null;
  };
  renderToStaticMarkup(React.createElement(Harness));
  if (!result) {
    throw new Error("useComposerSlash did not return a result");
  }
  return result;
}

describe("useComposerSlash", () => {
  beforeEach(() => {
    useAgentSkillsQueryMock.mockReset();
    useAgentSkillsQueryMock.mockReturnValue({
      status: "success",
      data: {
        agentKey: "mock-agent",
        skills: [
          {
            key: "pdf",
            name: "PDF",
            description: "Read PDFs",
            agentHasSkill: false,
          },
        ],
      },
      error: null,
      refetch: jest.fn(),
    });
  });

  it("combines commands and matching skills for the current agent", () => {
    const result = renderSlashHook({ inputValue: "/", currentAgentKey: "mock-agent" });

    expect(useAgentSkillsQueryMock).toHaveBeenCalledWith("mock-agent", {
      enabled: true,
    });
    expect(result.showSlashPalette).toBe(true);
    expect(result.slashCommands.length).toBeGreaterThan(0);
    expect(result.slashSkills).toMatchObject([
      { kind: "skill", key: "pdf", agentHasSkill: false },
    ]);
    expect(result.slashItems.at(-1)).toMatchObject({ kind: "skill", key: "pdf" });
  });

  it("does not enable the skills query for a Team", () => {
    const result = renderSlashHook({ inputValue: "/pdf", currentAgentKey: "" });

    expect(useAgentSkillsQueryMock).toHaveBeenCalledWith("", { enabled: false });
    expect(result.slashSkills).toEqual([]);
    expect(result.showSlashPalette).toBe(false);
  });

  it("keeps the palette open while a skill-only query is loading", () => {
    useAgentSkillsQueryMock.mockReturnValue({
      status: "loading",
      data: null,
      error: null,
      refetch: jest.fn(),
    });

    const result = renderSlashHook({ inputValue: "/pdf", currentAgentKey: "mock-agent" });

    expect(result.slashItems).toEqual([]);
    expect(result.slashSkillStatus).toBe("loading");
    expect(result.showSlashPalette).toBe(true);
  });
});

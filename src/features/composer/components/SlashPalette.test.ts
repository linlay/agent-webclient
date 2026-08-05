import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SlashPalette } from "@/features/composer/components/SlashPalette";

jest.mock("antd", () => ({
  Popover: ({ content, children }: { content: React.ReactNode; children: React.ReactNode }) =>
    React.createElement("div", null, content, children),
  Typography: {
    Text: ({ children, className }: Record<string, unknown>) =>
      React.createElement("span", { className: className as string }, children),
  },
  Tag: ({ children, className }: Record<string, unknown>) =>
    React.createElement("span", { className: className as string }, children),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const availability = {
  streaming: false,
  hasLatestQuery: false,
  isFrontendActive: false,
  canUsePlanningMode: false,
  canUseEditingMode: false,
  canUseVoiceMode: false,
  hasActiveChat: false,
  hasCurrentWorker: true,
  workerHistoryCount: 0,
  commandOverlayOpen: false,
  canShowUsage: false,
};

const command = {
  kind: "command" as const,
  id: "new" as const,
  icon: "edit_square" as const,
  command: "/new" as const,
  labelKey: "slash.command.new.label",
  descriptionKey: "slash.command.new.description",
  keywords: ["new"],
  label: "New chat",
  description: "Start a new chat",
};

function renderPalette(
  props: Partial<React.ComponentProps<typeof SlashPalette>> = {},
) {
  return renderToStaticMarkup(
    React.createElement(
      SlashPalette,
      {
        open: true,
        slashPaletteRef: React.createRef(),
        slashCommands: [command],
        slashSkills: [],
        slashSkillStatus: "success",
        slashSkillError: null,
        activeSlashIndex: 0,
        slashAvailability: availability,
        planningMode: false,
        selectedSkillKeys: [],
        skillsDisabled: false,
        onSelectCommand: jest.fn(),
        onSelectSkill: jest.fn(),
        onRetrySkills: jest.fn(),
        ...props,
      },
      React.createElement("div", null, "composer"),
    ),
  );
}

describe("SlashPalette", () => {
  it("renders command and skill groups with configured and Skill Center sources", () => {
    const html = renderPalette({
      slashSkills: [
        {
          kind: "skill",
          key: "mock-skill",
          name: "Mock Skill",
          label: "Mock Skill",
          description: "Skill description",
          agentHasSkill: true,
          command: "/mock-skill",
        },
        {
          kind: "skill",
          key: "pdf",
          name: "PDF",
          label: "PDF",
          description: "Read PDFs",
          agentHasSkill: false,
          command: "/pdf",
        },
      ],
      selectedSkillKeys: ["pdf"],
    });

    expect(html).toContain("slashPalette.group.commands");
    expect(html).toContain("slashPalette.group.skills");
    expect(html).toContain("/mock-skill");
    expect(html).toContain("slashPalette.skill.source.agent");
    expect(html).toContain("/pdf");
    expect(html).toContain('data-material-icon="check"');
  });

  it("renders loading, empty, and retryable error states", () => {
    expect(renderPalette({ slashSkillStatus: "loading" })).toContain(
      "slashPalette.skills.loading",
    );
    expect(renderPalette({ slashSkillStatus: "success" })).toContain(
      "slashPalette.skills.empty",
    );
    const errorHtml = renderPalette({
      slashSkillStatus: "error",
      slashSkillError: new Error("offline"),
    });
    expect(errorHtml).toContain("slashPalette.skills.loadFailed");
    expect(errorHtml).toContain("slashPalette.skills.retry");
    expect(errorHtml).toContain('title="offline"');
  });

  it("disables skill options while a run is active", () => {
    const html = renderPalette({
      skillsDisabled: true,
      slashSkills: [
        {
          kind: "skill",
          key: "pdf",
          name: "PDF",
          label: "PDF",
          description: "Read PDFs",
          agentHasSkill: false,
          command: "/pdf",
        },
      ],
    });

    expect(html).toContain("disabled");
  });
});

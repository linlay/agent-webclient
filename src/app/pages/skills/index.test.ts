import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillsPage } from "@/app/pages/skills";

const navigateMock = jest.fn();
let skillConsoleProps: {
  selectedSkillId?: string;
  onSelectSkillId?: (skillId: string) => void;
  onClearSelection?: () => void;
} = {};

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ search: "?lang=en" }),
  useNavigate: () => navigateMock,
  useParams: () => ({ skillId: "" }),
}));

jest.mock("@/features/skills/components/SkillConsole", () => ({
  SkillConsole: (props: typeof skillConsoleProps) => {
    skillConsoleProps = props;
    return React.createElement("div", { "data-testid": "skill-console" }, "skill console");
  },
}));

describe("SkillsPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    skillConsoleProps = {};
  });

  it("renders the skill console", () => {
    const html = renderToStaticMarkup(React.createElement(SkillsPage));
    expect(html).toContain("skill console");
  });

  it("preserves the route query when selecting a skill", () => {
    renderToStaticMarkup(React.createElement(SkillsPage));

    skillConsoleProps.onSelectSkillId?.("demo-skill");
    expect(navigateMock).toHaveBeenCalledWith("/skills/demo-skill?lang=en");
  });

  it("encodes a package child key as one route segment", () => {
    renderToStaticMarkup(React.createElement(SkillsPage));
    skillConsoleProps.onSelectSkillId?.("wecom/meeting");
    expect(navigateMock).toHaveBeenCalledWith("/skills/wecom%2Fmeeting?lang=en");
  });

  it("preserves the route query when clearing selection", () => {
    renderToStaticMarkup(React.createElement(SkillsPage));

    skillConsoleProps.onClearSelection?.();
    expect(navigateMock).toHaveBeenCalledWith("/skills?lang=en", {
      replace: true,
    });
  });
});

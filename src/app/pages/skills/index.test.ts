import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillsPage } from "@/app/pages/skills";

const navigateMock = jest.fn();
let locationMock = { pathname: "/skills", search: "?lang=en" };
let skillConsoleProps: {
  mobile?: boolean;
  selectedSkillId?: string;
  onSelectSkillId?: (skillId: string) => void;
  onClearSelection?: () => void;
} = {};

jest.mock("react-router-dom", () => ({
  useLocation: () => locationMock,
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
    locationMock = { pathname: "/skills", search: "?lang=en" };
    skillConsoleProps = {};
  });

  it("renders the skill console", () => {
    const html = renderToStaticMarkup(React.createElement(SkillsPage));
    expect(html).toContain("skill console");
  });

  it("passes the mobile presentation without a second page", () => {
    const desktopHtml = renderToStaticMarkup(React.createElement(SkillsPage));
    expect(skillConsoleProps.mobile).toBe(false);
    expect(desktopHtml).toContain('class="skills-page"');

    locationMock = { pathname: "/mobile/skills", search: "?lang=en" };
    const mobileHtml = renderToStaticMarkup(React.createElement(SkillsPage));
    expect(skillConsoleProps.mobile).toBe(true);
    expect(mobileHtml).toContain('class="skills-page"');
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

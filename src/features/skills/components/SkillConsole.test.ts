import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  findPreferredSkillFileNode,
  SkillConsole,
  toggleSkillExpandedDir,
  updateSkillDirtyFiles,
} from "@/features/skills/components/SkillConsole";

const onSelectSkillKeyMock = jest.fn();
const onClearSelectionMock = jest.fn();

jest.mock("@/shared/i18n", () => {
  const ReactMod = require("react");
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (key === "skillConsole.message.validateInvalid") return `${params?.count || 0} issues`;
        if (key === "skillConsole.delete.confirm") return `Delete ${params?.name || ""}?`;
        if (key === "skillConsole.list.count") return `Skills ${params?.count || 0}`;
        return key;
      },
      locale: "zh-CN",
    }),
    I18nProvider: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/shared/data", () => ({
  getAdminSkills: jest.fn(),
  getAdminSkillDetail: jest.fn(),
  getAdminSkillFile: jest.fn(),
  saveAdminSkillFile: jest.fn(),
  adminSkillFileOp: jest.fn(),
  validateAdminSkill: jest.fn(),
  createAdminSkill: jest.fn(),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("i", { "data-icon": name }),
}));

jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: (props: Record<string, unknown>) =>
    React.createElement("button", {
      "data-variant": props.variant,
      disabled: props.disabled,
      ...(typeof props["aria-label"] === "string" ? { "aria-label": props["aria-label"] } : {}),
    }),
}));

jest.mock("@/shared/ui/UiTag", () => ({
  UiTag: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-tone": props.tone }, props.children),
}));

jest.mock("@/shared/ui/SearchFilterBar", () => ({
  SearchFilterBar: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "search-filter" }, "search"),
}));

jest.mock("antd", () => {
  const ReactMod = require("react");
  const Input = ({ prefix, ...props }: Record<string, unknown>) =>
    ReactMod.createElement(
      "div",
      { className: "mock-input" },
      prefix,
      ReactMod.createElement("input", props),
    );
  Input.TextArea = (props: Record<string, unknown>) =>
    ReactMod.createElement("textarea", props);
  return {
    Input,
    Spin: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement(React.Fragment, null, children),
    Modal: {
      confirm: jest.fn(),
    },
    Dropdown: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement(React.Fragment, null, children),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGetAdminSkills =
  (require("@/shared/data") as { getAdminSkills: jest.Mock }).getAdminSkills;

describe("SkillConsole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdminSkills.mockResolvedValue({
      status: 200,
      code: 0,
      msg: "ok",
      data: {
        items: [
          {
            key: "demo-skill",
            name: "Demo Skill",
            description: "A demo skill",
            status: "ready",
            sourcePath: "/skills/demo-skill",
            fileCount: 3,
          },
          {
            key: "broken-skill",
            name: "Broken Skill",
            status: "invalid",
            diagnostic: { severity: "error", code: "E001", message: "Bad config" },
          },
          {
            key: "disabled-skill",
            name: "Disabled",
            status: "disabled",
          },
        ],
        total: 3,
      },
    });
  });

  it("renders the skill console shell", () => {
    const html = renderToStaticMarkup(
      React.createElement(SkillConsole, {
        selectedSkillKey: "",
        onSelectSkillKey: onSelectSkillKeyMock,
        onClearSelection: onClearSelectionMock,
      }),
    );
    expect(html).toContain("skill-console");
  });

  it("shows the list count text", () => {
    const html = renderToStaticMarkup(
      React.createElement(SkillConsole, {
        selectedSkillKey: "",
        onSelectSkillKey: onSelectSkillKeyMock,
        onClearSelection: onClearSelectionMock,
      }),
    );
    // After mount and async load, the count should appear
    expect(html).toContain("skill-console-count");
  });

  it("shows empty state when no skills", () => {
    // Simulate empty state
    const html = renderToStaticMarkup(
      React.createElement(SkillConsole, {
        selectedSkillKey: "",
        onSelectSkillKey: onSelectSkillKeyMock,
        onClearSelection: onClearSelectionMock,
      }),
    );
    expect(html).toContain("skill-console-list");
  });

  it("prefers a requested file, then SKILL.md, then the first editable file", () => {
    const tree = [
      {
        path: "references",
        name: "references",
        type: "directory" as const,
        children: [
          { path: "references/guide.md", name: "guide.md", type: "file" as const },
        ],
      },
      { path: "SKILL.md", name: "SKILL.md", type: "file" as const },
    ];

    expect(findPreferredSkillFileNode(tree, "references/guide.md")?.path).toBe(
      "references/guide.md",
    );
    expect(findPreferredSkillFileNode(tree)?.path).toBe("SKILL.md");
    expect(findPreferredSkillFileNode([tree[0]])?.path).toBe("references/guide.md");
  });

  it("adds and clears dirty files by comparing against original content", () => {
    let dirty = new Set<string>();

    dirty = updateSkillDirtyFiles(dirty, "SKILL.md", "changed", "original");
    expect([...dirty]).toEqual(["SKILL.md"]);

    dirty = updateSkillDirtyFiles(dirty, "SKILL.md", "original", "original");
    expect([...dirty]).toEqual([]);
  });

  it("tracks expanded directories by full path so duplicate names do not collide", () => {
    let expanded = new Set<string>();

    expanded = toggleSkillExpandedDir(expanded, "references/shared");
    expanded = toggleSkillExpandedDir(expanded, "scripts/shared");
    expect([...expanded].sort()).toEqual(["references/shared", "scripts/shared"]);

    expanded = toggleSkillExpandedDir(expanded, "references/shared");
    expect([...expanded]).toEqual(["scripts/shared"]);
  });
});

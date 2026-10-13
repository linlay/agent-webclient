import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReferenceCard } from "./ReferenceCard";

jest.mock("@/shared/data", () => ({ fetchSkillIcon: jest.fn() }));

const skillReference = {
  id: "skill-creator",
  name: "技能创建",
  type: "skill",
};

it("renders skill references through the skill-center icon slot", () => {
  const html = renderToStaticMarkup(
    <ReferenceCard
      reference={skillReference}
      variant="composer"
      skillIcon="/api/skills/icon?agentKey=demo&id=skill-creator"
    />,
  );
  expect(html).toContain('data-reference-type="skill"');
  expect(html).toContain("width:34px");
  // 静态渲染下头像尚未加载完成，先显示技能中心同款默认图标。
  expect(html).toContain('data-material-icon="build"');
});

it("keeps the skill-center default icon when no avatar url resolves", () => {
  const html = renderToStaticMarkup(
    <ReferenceCard reference={skillReference} variant="composer" />,
  );
  expect(html).toContain('data-reference-type="skill"');
  expect(html).toContain("width:34px");
  expect(html).toContain('data-material-icon="build"');
  expect(html).not.toContain('data-material-icon="skills"');
});

it("ignores the skill icon for non-skill references", () => {
  const html = renderToStaticMarkup(
    <ReferenceCard
      reference={{ id: "lib-a", name: "资料库", type: "kbase" }}
      variant="timeline"
      skillIcon="/api/skills/icon?agentKey=demo&id=skill-creator"
    />,
  );
  expect(html).toContain('data-reference-type="kbase"');
  expect(html).toContain('data-material-icon="book_2"');
  expect(html).not.toContain("width:34px");
});

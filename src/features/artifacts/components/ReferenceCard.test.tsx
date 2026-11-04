import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReferenceCard } from "./ReferenceCard";

jest.mock("@/shared/data", () => ({ fetchSkillIcon: jest.fn() }));
jest.mock("@/features/surfaces/hooks/useOpenTarget", () => ({ useOpenTarget: () => jest.fn() }));

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
      skillIcon={<span style={{ width: 20 }} data-material-icon="build" />}
    />,
  );
  expect(html).toContain('data-reference-type="skill"');
  expect(html).toContain("width:20px");
  // 静态渲染下头像尚未加载完成，先显示技能中心同款默认图标。
  expect(html).toContain('data-material-icon="build"');
});

it("keeps the skill-center default icon when no avatar url resolves", () => {
  const html = renderToStaticMarkup(
    <ReferenceCard reference={skillReference} variant="composer" />,
  );
  expect(html).toContain('data-reference-type="skill"');
  expect(html).toContain("width:20px");
  expect(html).toContain('data-material-icon="bolt"');
  expect(html).not.toContain('data-material-icon="skills"');
});

it("ignores the skill icon for non-skill references", () => {
  const html = renderToStaticMarkup(
    <ReferenceCard
      reference={{ id: "lib-a", name: "资料库", type: "kbase" }}
      variant="timeline"
      skillIcon={<span style={{ width: 20 }} data-material-icon="build" />}
    />,
  );
  expect(html).toContain('data-reference-type="kbase"');
  expect(html).toContain('data-material-icon="book_2"');
  expect(html).not.toContain("width:20px");
});

it("offers skill opening only when its host supplies an action", () => {
  const standalone = renderToStaticMarkup(<ReferenceCard reference={skillReference} variant="timeline" />);
  expect(standalone).not.toContain('role="button"');
  const hosted = renderToStaticMarkup(<ReferenceCard reference={skillReference} variant="timeline" openTarget={() => undefined} />);
  expect(hosted).toContain('role="button"');
});

it.each(["chat", "site", "skill", "kbase"])("uses the attachment card layout for %s references", (type) => {
  const html = renderToStaticMarkup(<ReferenceCard
    reference={{ id: "reference-id", name: "资料.v2", type }}
    variant="composer" onRemove={() => undefined}
  />);
  expect(html).toContain("attachment-card-composer");
  expect(html).not.toContain("attachment-card-default");
  expect(html).not.toContain("attachment-card-compact");
  expect(html).toContain("attachment-card-file-shell");
  expect(html).toContain("context-reference-card-icon");
  expect(html).not.toContain("attachment-card-file-icon");
  expect(html).toContain("font-size:20px");
  expect(html).toContain("attachment-card-file-copy");
  expect(html).toContain("attachment-card-title");
  expect(html).toContain("attachment-card-subtitle");
  expect(html).toContain("attachment-card-remove");
  expect(html).toContain('class="attachment-card-name">资料.v2</span>');
  expect(html).not.toContain("attachment-card-extension");
});

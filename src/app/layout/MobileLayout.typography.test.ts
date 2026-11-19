import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 移动端正文放大是纯 CSS 层叠结果，DOM 测试看不到最终字号，这里锁定关键规则。
 * 放大必须挂在 `.conversation` 下：桌面时间线、输入区和侧栏共用 `.timeline-text`
 * 一类全局类名，脱离会话容器就会一起变。
 */
const styles = readFileSync(join(__dirname, "MobileLayout.module.css"), "utf8")
  .replace(/\s+/g, " ");
const presentation = readFileSync(
  join(__dirname, "../../features/timeline/components/TimelinePresentation.module.css"),
  "utf8",
).replace(/\s+/g, " ");

const READING_RULES = [
  '.conversation :global(.timeline-row[data-kind="content"]) :global(.timeline-markdown) { font-size: 17px; }',
  ".conversation :global(.timeline-row-user) :global(.timeline-text) { font-size: 16px; line-height: 1.6; }",
  ".conversation :global(.timeline-text) { font-size: 15px; }",
  ".conversation :global(.timeline-markdown) { --font-size: inherit; font-size: 15px; }",
];

const PROCESS_RULES = [
  ".conversation :global(.timeline-run-collapse) { font-size: 15px; }",
  ".conversation :global(.timeline-thinking-label) { font-size: 14px; }",
  ".conversation :global(.tool-pill-status-row) { font-size: 14px; }",
  ".conversation :global(.tool-call-inline), .conversation :global(.tool-call-result) { font-size: 14px; }",
  ".conversation :global(.tool-pill-duration) { font-size: 13px; }",
  ".conversation :global(.timeline-task-group-title), .conversation :global(.timeline-task-group-agent-name) { font-size: 13px; }",
];

describe("mobile conversation typography", () => {
  it("lifts the reading scale above the desktop timeline", () => {
    // 桌面主对话正文 15px、用户气泡 14px、其它正文 13px；移动端各自上调。
    READING_RULES.forEach((rule) => expect(styles).toContain(rule));
  });

  it("lifts thinking, tool and task process components", () => {
    PROCESS_RULES.forEach((rule) => expect(styles).toContain(rule));
    expect(presentation).toContain(
      ":global(.layout-mobile) .thinking-detail { font-size: 15px; line-height: 1.65; }",
    );
  });

  it("scopes every enlarged reading rule to the conversation container", () => {
    READING_RULES.forEach((rule) => expect(rule.startsWith(".conversation ")).toBe(true));
    // 会话舞台不设整体字号，避免继承链再把折叠行、工具元信息一起放大。
    expect(styles).not.toMatch(/:global\(\.conversation-stage\)\s*\{[^}]*font-size/);
  });
});

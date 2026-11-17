import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 档位收敛是纯 CSS，DOM 测试看不到层叠结果，这里直接锁定关键规则。 */
const styles = readFileSync(join(__dirname, "Timeline.module.css"), "utf8").replace(/\s+/g, " ");
const SIMPLE = ':global(.conversation-stage-virtuoso[data-detail-level="simple"])';

describe("simple detail level renders icons inline instead of a column", () => {
  it("collapses every flow row to a single column", () => {
    // 没有图标列，正文与展开体才能共用同一条左边缘。
    expect(styles).toContain(`${SIMPLE} :global(.timeline-row-flow) { grid-template-columns: minmax(0, 1fr); }`);
  });

  it("keeps a marker fallback that cannot orphan an empty column", () => {
    // 上下文未注入 detailLevel 时行内图标不出现；此时撤掉图标列仍然是单列，不会塌成 18px。
    expect(styles).toContain(`${SIMPLE} :global(.timeline-marker) { display: none; }`);
  });

  it("styles the inline icon and inline row slots", () => {
    expect(styles).toContain(":global(.timeline-inline-icon)");
    expect(styles).toContain("width: 18px; height: 18px;");
    expect(styles).toContain(":global(.timeline-inline-row)");
    expect(styles).toContain(":global(.timeline-label-with-icon)");
  });

  it("no longer needs negative-margin compensation", () => {
    // 图标进了头部，展开体天然从 0 开始；负边距会在折叠动画的 overflow 下被裁剪。
    expect(styles).not.toContain("timeline-body-outdent");
    expect(styles).not.toContain("margin-left: calc(-1 *");
  });
});

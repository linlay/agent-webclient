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
    // 活动头像按 32px 绘制，行内活动行的图标-文案间距要单独放宽。
    expect(styles).toContain(":global(.timeline-inline-row-activity) { gap: 16px; }");
  });

  it("no longer needs negative-margin compensation", () => {
    // 图标进了头部，展开体天然从 0 开始；负边距会在折叠动画的 overflow 下被裁剪。
    expect(styles).not.toContain("timeline-body-outdent");
    expect(styles).not.toContain("margin-left: calc(-1 *");
  });
});

describe("wait rows center the marker on the taller card", () => {
  it("restarts the connector below the centered icon", () => {
    // 图标随卡片中线居中，连线不能从行首 20px 起穿过图标。
    expect(styles).toContain(":global(.timeline-row-wait) :global(.timeline-marker)::after { top: calc(50% + 9px); }");
    // simple 档的图标在行内槽位里，也要随卡片中线居中。
    expect(styles).toContain(":global(.timeline-inline-row.timeline-inline-row-center) { align-items: center; }");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Windows 上“滚动时正文变粗”不是字重在变，而是合成器滚动期间 LCD（ClearType）次像素
 * 抗锯齿不可用、退回灰度绘制。这是纯栅格化行为，DOM 测试看不到，这里直接锁定写法本身：
 * 去掉列表内容的常驻合成层，Windows 上就会重新逐帧重栅格化，问题复现。
 */
const styles = readFileSync(join(__dirname, "Timeline.module.css"), "utf8").replace(/\s+/g, " ");

describe("conversation stage keeps one stable raster while scrolling", () => {
  it("pins the virtualized list content into its own compositing layer", () => {
    // 滚动只平移已栅格化的纹理，不再逐帧重栅格化；删掉这行 Windows 上滚动时整列文字会变粗。
    expect(styles).toContain(">div { will-change: transform;");
  });

  it("keeps the macOS font smoothing fallback beside it", () => {
    // 这两行只在 macOS 生效（Windows 无等价 CSS），是同一现象在 mac 上的兜底；
    // 有合成层兜底后也不要顺手删掉。
    expect(styles).toContain(
      "-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;",
    );
  });
});

import fs from "node:fs";
import path from "node:path";
import {
  computeThumbGeometry,
  isOverlayScrollbarDisabled,
  parseOverlayInsetEnd,
  OVERLAY_SCROLLBAR_HIDE_DELAY_MS,
  OVERLAY_SCROLLBAR_MIN_LENGTH,
} from "./overlayScrollbars";

const sourceRoot = path.resolve(__dirname, "../..");

describe("overlay scrollbar wiring", () => {
  it("installs from the app entry and keeps the export entry native", () => {
    const appEntry = fs.readFileSync(path.join(sourceRoot, "app/index.tsx"), "utf8");
    expect(appEntry).toContain("installOverlayScrollbars()");
    expect(appEntry).toContain("@/shared/styles/overlayScrollbars.css");
    expect(fs.existsSync(path.join(sourceRoot, "export/index.tsx"))).toBe(true);
    expect(fs.readFileSync(path.join(sourceRoot, "export/index.tsx"), "utf8")).not.toContain("overlayScrollbars");
  });

  it("ships the shared skin and opt-out hooks", () => {
    const styles = fs.readFileSync(path.join(sourceRoot, "shared/styles/overlayScrollbars.css"), "utf8");
    expect(styles).toContain(".app-scrollbar-thumb");
    expect(styles).toContain('html[data-overlay-scrollbars="ready"]');
    expect(styles).toContain("--app-scrollbar-overlay");
    expect(styles).toContain("--app-scrollbar-thumb");
    expect(styles).toContain(".rc-virtual-list-scrollbar-vertical");
    expect(styles).toContain(".xterm-scrollable-element");
    expect(fs.existsSync(path.join(sourceRoot, "shared/styles/scrollbarClassNames.ts"))).toBe(false);
  });
});

describe("overlay scrollbar geometry", () => {
  it("keeps the sidebar standard timing and minimum length", () => {
    expect(OVERLAY_SCROLLBAR_HIDE_DELAY_MS).toBe(800);
    expect(OVERLAY_SCROLLBAR_MIN_LENGTH).toBe(24);
  });

  it("maps scroll progress onto the available thumb travel", () => {
    const geometry = computeThumbGeometry({
      clientSize: 200,
      scrollSize: 900,
      scrollOffset: 350,
    });
    const length = (200 * 200) / 900;
    expect(geometry.visible).toBe(true);
    expect(geometry.length).toBeCloseTo(length);
    expect(geometry.offset).toBeCloseTo((350 / 700) * (200 - length));
  });

  it("clamps short viewports and out-of-range scroll offsets", () => {
    const short = computeThumbGeometry({ clientSize: 10, scrollSize: 100, scrollOffset: 0 });
    expect(short).toEqual({ length: 10, offset: 0, visible: true });

    const overscrolled = computeThumbGeometry({ clientSize: 200, scrollSize: 900, scrollOffset: 5000 });
    expect(overscrolled.offset).toBeCloseTo(200 - overscrolled.length);
  });

  it("reports no thumb when the container cannot scroll", () => {
    expect(computeThumbGeometry({ clientSize: 200, scrollSize: 200, scrollOffset: 0 })).toEqual({
      length: 0,
      offset: 0,
      visible: false,
    });
    expect(computeThumbGeometry({ clientSize: 0, scrollSize: 200, scrollOffset: 0 })).toEqual({
      length: 0,
      offset: 0,
      visible: false,
    });
  });
});

describe("overlay scrollbar preferences", () => {
  it("reads the deliberate opt-out marker from computed style", () => {
    const style = (value: string) => ({ getPropertyValue: () => value }) as unknown as CSSStyleDeclaration;
    expect(isOverlayScrollbarDisabled(style(" off "))).toBe(true);
    expect(isOverlayScrollbarDisabled(style(""))).toBe(false);
  });

  it("parses the optional edge inset and falls back to zero", () => {
    expect(parseOverlayInsetEnd("4px")).toBe(4);
    expect(parseOverlayInsetEnd("8px")).toBe(8);
    expect(parseOverlayInsetEnd("")).toBe(0);
    expect(parseOverlayInsetEnd("auto")).toBe(0);
  });
});

import {
  SLASH_POPOVER_MAX_HEIGHT,
  SLASH_POPOVER_MIN_HEIGHT,
  SLASH_POPOVER_VIEWPORT_MARGIN,
  getSlashPopoverMaxHeight,
} from "@/features/composer/lib/slashPaletteLayout";

describe("getSlashPopoverMaxHeight", () => {
  it("caps the palette at 360px when the composer sits low enough", () => {
    expect(getSlashPopoverMaxHeight(900)).toBe(SLASH_POPOVER_MAX_HEIGHT);
    expect(getSlashPopoverMaxHeight(SLASH_POPOVER_MAX_HEIGHT + SLASH_POPOVER_VIEWPORT_MARGIN)).toBe(
      SLASH_POPOVER_MAX_HEIGHT,
    );
  });

  it("shrinks to the space above the composer in a short window", () => {
    // 视口 441px、输入框顶边 225px：旧公式 min(360, 100vh - 120) 会给 321px，顶出视口。
    expect(getSlashPopoverMaxHeight(225)).toBe(225 - SLASH_POPOVER_VIEWPORT_MARGIN);
  });

  it("keeps a scrollable minimum instead of collapsing to zero", () => {
    expect(getSlashPopoverMaxHeight(40)).toBe(SLASH_POPOVER_MIN_HEIGHT);
    expect(getSlashPopoverMaxHeight(0)).toBe(SLASH_POPOVER_MIN_HEIGHT);
    expect(getSlashPopoverMaxHeight(-120)).toBe(SLASH_POPOVER_MIN_HEIGHT);
  });

  it("falls back to the static cap when the anchor is not measurable", () => {
    expect(getSlashPopoverMaxHeight(Number.NaN)).toBe(SLASH_POPOVER_MAX_HEIGHT);
    expect(getSlashPopoverMaxHeight(Number.POSITIVE_INFINITY)).toBe(SLASH_POPOVER_MAX_HEIGHT);
  });
});

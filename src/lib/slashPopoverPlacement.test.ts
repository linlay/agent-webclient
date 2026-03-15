import { computeSlashPopoverPlacement } from './slashPopoverPlacement';

describe('computeSlashPopoverPlacement', () => {
  it('places the popover above the anchor when there is enough space', () => {
    const placement = computeSlashPopoverPlacement({
      anchorRect: {
        top: 640,
        bottom: 700,
        left: 120,
        width: 420,
      },
      viewport: {
        width: 1440,
        height: 900,
      },
      preferredHeight: 280,
    });

    expect(placement.placement).toBe('above');
    expect(placement.top).toBeGreaterThanOrEqual(0);
    expect(placement.left).toBe(120);
    expect(placement.width).toBe(420);
  });

  it('falls back below the anchor when above space is insufficient', () => {
    const placement = computeSlashPopoverPlacement({
      anchorRect: {
        top: 96,
        bottom: 152,
        left: 20,
        width: 360,
      },
      viewport: {
        width: 1280,
        height: 820,
      },
      preferredHeight: 300,
    });

    expect(placement.placement).toBe('below');
    expect(placement.top).toBeGreaterThan(placement.left - 1000);
    expect(placement.top).toBeGreaterThanOrEqual(0);
  });

  it('keeps the popover inside the viewport horizontally and vertically', () => {
    const placement = computeSlashPopoverPlacement({
      anchorRect: {
        top: 180,
        bottom: 236,
        left: 1180,
        width: 300,
      },
      viewport: {
        width: 1280,
        height: 720,
      },
      preferredHeight: 340,
      minMargin: 12,
    });

    expect(placement.left + placement.width).toBeLessThanOrEqual(1280 - 12);
    expect(placement.top).toBeGreaterThanOrEqual(12);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(720 - 12 + 8);
  });
});

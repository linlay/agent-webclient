export interface SlashPopoverPlacementInput {
  anchorRect: {
    top: number;
    bottom: number;
    left: number;
    width: number;
  };
  viewport: {
    width: number;
    height: number;
  };
  preferredHeight?: number;
  minMargin?: number;
  gap?: number;
  minWidth?: number;
}

export interface SlashPopoverPlacement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'above' | 'below';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeSlashPopoverPlacement(
  input: SlashPopoverPlacementInput,
): SlashPopoverPlacement {
  const preferredHeight = Math.max(120, Number(input.preferredHeight ?? 320));
  const minMargin = Math.max(0, Number(input.minMargin ?? 12));
  const gap = Math.max(0, Number(input.gap ?? 8));
  const minWidth = Math.max(160, Number(input.minWidth ?? 280));
  const viewportWidth = Math.max(0, Number(input.viewport.width || 0));
  const viewportHeight = Math.max(0, Number(input.viewport.height || 0));
  const anchorWidth = Math.max(0, Number(input.anchorRect.width || 0));
  const width = Math.min(
    Math.max(anchorWidth, minWidth),
    Math.max(minWidth, viewportWidth - minMargin * 2),
  );

  const aboveSpace = Math.max(0, input.anchorRect.top - minMargin - gap);
  const belowSpace = Math.max(0, viewportHeight - input.anchorRect.bottom - minMargin - gap);
  const placement = aboveSpace >= preferredHeight || aboveSpace >= belowSpace
    ? 'above'
    : 'below';
  const availableHeight = placement === 'above' ? aboveSpace : belowSpace;
  const maxHeight = Math.max(120, Math.min(preferredHeight, availableHeight || preferredHeight));

  const top = placement === 'above'
    ? Math.max(minMargin, input.anchorRect.top - gap - maxHeight)
    : Math.min(
      Math.max(minMargin, viewportHeight - minMargin - maxHeight),
      input.anchorRect.bottom + gap,
    );
  const left = clamp(
    input.anchorRect.left,
    minMargin,
    Math.max(minMargin, viewportWidth - minMargin - width),
  );

  return {
    top,
    left,
    width,
    maxHeight,
    placement,
  };
}

import { describe, expect, it } from 'vitest';

import { findHtmlViewportBlocks, parseViewportBlocks } from './viewportParser.js';

describe('viewportParser', () => {
  it('parses viewport block with html type', () => {
    const text = `abc\n\n\`\`\`viewport\ntype=html, key=show_weather_card\n{"city":"Shanghai"}\n\`\`\`\n`;

    const blocks = parseViewportBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('html');
    expect(blocks[0].key).toBe('show_weather_card');
    expect(blocks[0].payload).toEqual({ city: 'Shanghai' });
  });

  it('keeps only html blocks for rendering helper', () => {
    const text = `\`\`\`viewport\ntype=qlc, key=form_a\n{"schema":{}}\n\`\`\`\n\n\`\`\`viewport\ntype=html, key=card_b\n{"ok":true}\n\`\`\``;

    const htmlBlocks = findHtmlViewportBlocks(text);
    expect(htmlBlocks).toHaveLength(1);
    expect(htmlBlocks[0].key).toBe('card_b');
  });

  it('supports spaces in header line', () => {
    const text = `\`\`\`viewport\n type = html ,  key = x_card\n{"a":1}\n\`\`\``;

    const htmlBlocks = findHtmlViewportBlocks(text);
    expect(htmlBlocks).toHaveLength(1);
    expect(htmlBlocks[0].type).toBe('html');
    expect(htmlBlocks[0].key).toBe('x_card');
  });
});

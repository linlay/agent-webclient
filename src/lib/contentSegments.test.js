import { describe, expect, it } from 'vitest';

import { parseContentSegments, stripViewportBlocksFromText } from './contentSegments.js';

describe('contentSegments', () => {
  it('splits text before and after viewport block', () => {
    const text = [
      'before',
      '```viewport',
      'type=html, key=weather_card',
      '{"city":"Shanghai"}',
      '```',
      'after'
    ].join('\n');

    const segments = parseContentSegments('c-1', text);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ kind: 'text', text: 'before' });
    expect(segments[1].kind).toBe('viewport');
    expect(segments[1].key).toBe('weather_card');
    expect(segments[2]).toEqual({ kind: 'text', text: 'after' });
  });

  it('keeps non-html viewport blocks as text', () => {
    const text = [
      '```viewport',
      'type=qlc, key=form_a',
      '{"schema":{}}',
      '```'
    ].join('\n');

    const segments = parseContentSegments('c-2', text);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('text');
    expect(segments[0].text).toContain('type=qlc, key=form_a');
  });

  it('strips viewport blocks from plain text content', () => {
    const text = [
      'line-1',
      '',
      '```viewport',
      'type=html, key=demo',
      '{}',
      '```',
      '',
      'line-2'
    ].join('\n');

    expect(stripViewportBlocksFromText(text)).toBe('line-1\n\nline-2');
  });
});

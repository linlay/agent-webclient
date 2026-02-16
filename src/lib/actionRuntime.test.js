import { describe, expect, it } from 'vitest';

import { normalizeActionArgs, safeJsonParse } from './actionRuntime.js';

describe('actionRuntime', () => {
  it('normalizes switch_theme with fallback', () => {
    expect(normalizeActionArgs('switch_theme', { theme: 'dark' })).toEqual({ theme: 'dark' });
    expect(normalizeActionArgs('switch_theme', { theme: 'anything' })).toEqual({ theme: 'light' });
  });

  it('clamps launch_fireworks duration', () => {
    expect(normalizeActionArgs('launch_fireworks', { durationMs: 99999 })).toEqual({ durationMs: 30000 });
    expect(normalizeActionArgs('launch_fireworks', { durationMs: 300 })).toEqual({ durationMs: 1000 });
    expect(normalizeActionArgs('launch_fireworks', {})).toEqual({ durationMs: 8000 });
  });

  it('fills default modal values', () => {
    expect(normalizeActionArgs('show_modal', { title: '', content: '', closeText: '' })).toEqual({
      title: '通知',
      content: '',
      closeText: '关闭'
    });
  });

  it('safeJsonParse returns fallback on invalid json', () => {
    expect(safeJsonParse('{"x":1}', {})).toEqual({ x: 1 });
    expect(safeJsonParse('{bad', { z: 2 })).toEqual({ z: 2 });
  });
});

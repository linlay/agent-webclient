import { describe, expect, it } from 'vitest';

import { parseFrontendToolParams } from './frontendToolParams.js';

describe('frontendToolParams', () => {
  it('uses toolParams object first', () => {
    const parsed = parseFrontendToolParams({
      toolId: 't1',
      toolParams: { question: 'q', options: ['a', 'b'] },
      function: { arguments: '{"question":"ignored"}' }
    });

    expect(parsed.found).toBe(true);
    expect(parsed.source).toBe('toolParams');
    expect(parsed.params).toEqual({ question: 'q', options: ['a', 'b'] });
  });

  it('parses function.arguments json string', () => {
    const parsed = parseFrontendToolParams({
      toolId: 't2',
      function: {
        arguments: '{"question":"请选择","options":["自然风光","历史文化"],"allowFreeText":false}'
      }
    });

    expect(parsed.found).toBe(true);
    expect(parsed.source).toBe('function.arguments');
    expect(parsed.params).toEqual({
      question: '请选择',
      options: ['自然风光', '历史文化'],
      allowFreeText: false
    });
  });

  it('falls back to arguments json string', () => {
    const parsed = parseFrontendToolParams({
      toolId: 't3',
      arguments: '{"question":"q3"}'
    });

    expect(parsed.found).toBe(true);
    expect(parsed.source).toBe('arguments');
    expect(parsed.params).toEqual({ question: 'q3' });
  });

  it('accepts function.arguments object directly', () => {
    const parsed = parseFrontendToolParams({
      toolId: 't3.1',
      function: {
        arguments: { question: 'q3.1', options: ['a'] }
      }
    });

    expect(parsed.found).toBe(true);
    expect(parsed.source).toBe('function.arguments');
    expect(parsed.params).toEqual({ question: 'q3.1', options: ['a'] });
  });

  it('returns {} on invalid json with error', () => {
    const parsed = parseFrontendToolParams({
      toolId: 't4',
      function: {
        arguments: '{"question":"bad"'
      }
    });

    expect(parsed.found).toBe(true);
    expect(parsed.source).toBe('function.arguments');
    expect(parsed.params).toEqual({});
    expect(parsed.error).toContain('parse function.arguments failed');
    expect(parsed.error).toContain('raw=');
  });

  it('returns not found when no params source exists', () => {
    const parsed = parseFrontendToolParams({ toolId: 't5' });
    expect(parsed.found).toBe(false);
    expect(parsed.params).toBeNull();
  });
});

import { parseFrontendToolParams } from './frontendToolParams';

describe('parseFrontendToolParams', () => {
  it('reads params only from toolParams', () => {
    expect(parseFrontendToolParams({
      toolId: 'tool_1',
      toolParams: { foo: 'bar' },
    })).toEqual({
      found: true,
      source: 'toolParams',
      params: { foo: 'bar' },
    });
  });

  it('does not fallback to removed legacy argument fields', () => {
    expect(parseFrontendToolParams({
      toolId: 'tool_legacy',
    } as { toolId: string })).toEqual({
      found: false,
      source: '',
      params: null,
    });
  });
});

import { parseFrontendToolParams } from '@/features/tools/lib/frontendToolParams';

describe('parseFrontendToolParams', () => {
  it('reads params from toolParams', () => {
    expect(parseFrontendToolParams({
      toolId: 'tool_1',
      toolParams: { foo: 'bar' },
    })).toEqual({
      found: true,
      source: 'toolParams',
      params: { foo: 'bar' },
    });
  });

  it('ignores events without toolParams', () => {
    expect(parseFrontendToolParams({
      toolId: 'tool_without_params',
    })).toMatchObject({
      found: false,
      source: '',
      params: null,
    });
  });
});

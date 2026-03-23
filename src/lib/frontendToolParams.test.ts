import { parseFrontendToolParams } from './frontendToolParams';

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

  it('reads params from JSON arguments snapshots', () => {
    expect(parseFrontendToolParams({
      toolId: 'tool_legacy',
      arguments: '{"offset":"+2D"}',
    })).toEqual({
      found: true,
      source: 'arguments',
      params: { offset: '+2D' },
    });
  });

  it('keeps invalid arguments payloads out of frontend params parsing', () => {
    expect(parseFrontendToolParams({
      toolId: 'tool_invalid',
      arguments: '{invalid json}',
    })).toMatchObject({
      found: false,
      source: 'arguments',
      params: null,
    });
  });
});

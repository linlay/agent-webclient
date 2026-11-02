import {
  parseContentSegments,
  stripPendingSpecialFenceTail,
} from '@/features/events/lib/contentSegments';

describe('contentSegments', () => {
  it('only buffers unfinished VIEW headers', () => {
    expect(stripPendingSpecialFenceTail('before\n```vie')).toBe('before');
    expect(stripPendingSpecialFenceTail('before\n```ts')).toBe('before\n```ts');
    expect(stripPendingSpecialFenceTail('before\n```tts-voice')).toBe('before\n```tts-voice');
  });
  it('keeps historical voice fences as ordinary Markdown text', () => {
    const raw = '```tts-voice\nSpoken answer\n```';
    expect(parseContentSegments('history', raw)).toEqual([{ kind: 'text', text: raw }]);
  });
});

import viewCases from './__fixtures__/view_markdown_cases.json';

describe('VIEW Markdown grammar (shared with agent-platform)', () => {
  // The platform binds only fences closed by a terminated line while streaming;
  // the client renders on settled text, so only final cases apply here.
  for (const testCase of viewCases.cases.filter((item) => item.final)) {
    it(testCase.name, () => {
      const blocks = parseContentSegments('c', testCase.text)
        .filter((segment) => segment.kind === 'view' && segment.closed);
      expect(blocks.map((segment) => ({
        index: segment.index,
        ...(segment.key ? { key: segment.key } : {}),
        ...(segment.error ? { error: segment.error } : {}),
        ...(!segment.error ? { data: JSON.parse(segment.payloadRaw || 'null') } : {}),
      }))).toEqual(testCase.blocks);
    });
  }

  it('keeps text around VIEW blocks and the raw block for fallback', () => {
    const raw = '```view key=crm/orders\n{"items":[]}\n```';
    expect(parseContentSegments('c1', `前文\n${raw}\n后文`)).toEqual([
      { kind: 'text', text: '前文' },
      { kind: 'view', index: 0, signature: 'c1::view::0', key: 'crm/orders', payloadRaw: '{"items":[]}', text: `${raw}\n`, closed: true, error: undefined },
      { kind: 'text', text: '后文' },
    ]);
  });

  it('marks an open VIEW fence while streaming', () => {
    expect(parseContentSegments('c1', '```view key=crm/orders\n{"items":')).toEqual([
      { kind: 'view', index: 0, signature: 'c1::view::0', key: 'crm/orders', payloadRaw: '{"items":', text: '```view key=crm/orders\n{"items":', closed: false, error: 'view_data_invalid' },
    ]);
  });

  it('never loads the retired viewport fence', () => {
    const raw = '```viewport\n{"key":"platform_control_review"}\n```';
    expect(parseContentSegments('old', raw)).toEqual([{ kind: 'text', text: raw }]);
  });
});

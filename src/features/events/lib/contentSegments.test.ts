import {
  parseContentSegments,
  stripPendingSpecialFenceTail,
} from '@/features/events/lib/contentSegments';

describe('contentSegments', () => {
  it('hides an unfinished special fence header at the tail while streaming', () => {
    expect(stripPendingSpecialFenceTail('前文\n```tts')).toBe('前文');
    expect(stripPendingSpecialFenceTail('前文\n```tts-voice')).toBe('前文');
    expect(stripPendingSpecialFenceTail('前文\n```viewport')).toBe('前文\n```viewport');
  });

  it('keeps ordinary code fences untouched', () => {
    expect(stripPendingSpecialFenceTail('示例\n```ts')).toBe('示例\n```ts');
  });

  it('parses a tts-voice block when the fence header and closing fence arrive in separate deltas', () => {
    const deltas = [
      '```tts',
      '-voice\n人类',
      '已验证的最长',
      '寿命为12',
      '2岁16',
      '4天，由',
      '法国女性让娜',
      '·卡尔芒保持',
      '，至今未被打破',
      '。\n',
      '```\n\n# ',
    ];

    expect(parseContentSegments('mmu1dwwa_c_4', deltas.join(''))).toEqual([
      {
        kind: 'ttsVoice',
        signature: 'mmu1dwwa_c_4::tts-voice::0',
        text: '人类已验证的最长寿命为122岁164天，由法国女性让娜·卡尔芒保持，至今未被打破。\n',
        closed: true,
        startOffset: 0,
      },
      {
        kind: 'text',
        text: '#',
      },
    ]);
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
        ...(segment.query ? { query: segment.query } : {}),
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

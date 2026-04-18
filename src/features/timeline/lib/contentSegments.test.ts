import {
  parseContentSegments,
  stripPendingSpecialFenceTail,
} from '@/features/timeline/lib/contentSegments';

describe('contentSegments', () => {
  it('hides an unfinished special fence header at the tail while streaming', () => {
    expect(stripPendingSpecialFenceTail('前文\n```tts')).toBe('前文');
    expect(stripPendingSpecialFenceTail('前文\n```tts-voice')).toBe('前文');
    expect(stripPendingSpecialFenceTail('前文\n```viewport')).toBe('前文');
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

import type { TimelineNode } from '@/app/state/types';
import { serializeRunTranscript } from '@/features/timeline/lib/runTranscript';

function createNode(partial: Partial<TimelineNode> & Pick<TimelineNode, 'id' | 'kind' | 'ts'>): TimelineNode {
  return partial as TimelineNode;
}

describe('serializeRunTranscript', () => {
  it('serializes a full run with query, thinking, tools, and answer', () => {
    const text = serializeRunTranscript(
      createNode({ id: 'user_1', kind: 'message', role: 'user', text: '查邮件', ts: 100 }),
      [
        createNode({ id: 'thinking_1', kind: 'thinking', text: '先找未读', ts: 110 }),
        createNode({
          id: 'tool_1',
          kind: 'tool',
          toolName: 'email.search',
          description: 'Search mailbox',
          argsText: '{\n  "folder": "INBOX"\n}',
          result: { text: '2 hits', isCode: false },
          ts: 120,
        }),
        createNode({ id: 'content_1', kind: 'content', text: '找到两封未读邮件。', ts: 130 }),
      ],
    );

    expect(text).toContain('Query\n查邮件');
    expect(text).toContain('Thinking\n先找未读');
    expect(text).toContain('Tools\n1. email.search');
    expect(text).toContain('description: Search mailbox');
    expect(text).toContain('arguments:\n{\n  "folder": "INBOX"\n}');
    expect(text).toContain('result:\n2 hits');
    expect(text).toContain('Answer\n找到两封未读邮件。');
  });

  it('omits empty sections and supports answer-only runs', () => {
    const text = serializeRunTranscript(
      createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'hi', ts: 100 }),
      [createNode({ id: 'content_1', kind: 'content', text: 'hello', ts: 110 })],
    );

    expect(text).toBe('Query\nhi\n\nAnswer\nhello');
  });
});

import { mergeAgentSummary, upsertAgentSummary } from './agentSummary';

describe('agentSummary', () => {
  it('merges fetched agent fields onto an existing agent', () => {
    expect(
      mergeAgentSummary(
        {
          key: 'alice',
          name: 'Alice',
          role: 'assistant',
          model: 'gpt-old',
        },
        {
          key: 'alice',
          role: 'researcher',
          tools: ['search'],
        },
      ),
    ).toEqual({
      key: 'alice',
      name: 'Alice',
      role: 'researcher',
      model: 'gpt-old',
      tools: ['search'],
    });
  });

  it('upserts a missing agent without dropping existing agents', () => {
    expect(
      upsertAgentSummary(
        [{ key: 'alice', name: 'Alice' }],
        { key: 'bob', name: 'Bob', role: 'reviewer' },
      ),
    ).toEqual([
      { key: 'alice', name: 'Alice' },
      { key: 'bob', name: 'Bob', role: 'reviewer' },
    ]);
  });
});

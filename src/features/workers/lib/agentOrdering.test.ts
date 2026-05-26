import type { Agent } from '@/app/state/types';
import {
  agentOrderPayload,
  filterAgentsPreservingOrder,
  moveAgentForDrop,
} from '@/features/workers/lib/agentOrdering';

function keys(agents: Agent[]): string[] {
  return agents.map((agent) => agent.key);
}

describe('agentOrdering', () => {
  const agents = [
    { key: 'agent-b', name: 'Beta', role: 'Second' },
    { key: 'agent-a', name: 'Alpha', role: 'First' },
    { key: 'agent-c', name: 'Gamma', role: 'Third' },
  ] as Agent[];

  it('filters agents without changing fixed relative order', () => {
    expect(keys(filterAgentsPreservingOrder(agents, 'agent'))).toEqual([
      'agent-b',
      'agent-a',
      'agent-c',
    ]);
    expect(keys(filterAgentsPreservingOrder(agents, 'first'))).toEqual(['agent-a']);
  });

  it('moves dropped agents through the fixed order', () => {
    expect(keys(moveAgentForDrop(agents, 'agent-b', 'agent-c'))).toEqual([
      'agent-a',
      'agent-c',
      'agent-b',
    ]);
    expect(keys(moveAgentForDrop(agents, 'agent-c', 'agent-b'))).toEqual([
      'agent-c',
      'agent-b',
      'agent-a',
    ]);
  });

  it('builds an order payload from valid agent keys', () => {
    expect(agentOrderPayload([...agents, { key: '', name: 'Empty' } as Agent])).toEqual([
      'agent-b',
      'agent-a',
      'agent-c',
    ]);
  });
});

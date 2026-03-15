import type { Team } from '../context/types';
import { readTeamAgentKeys } from './teamUtils';

describe('readTeamAgentKeys', () => {
  it('collects unique keys from agentKey, agentKeys, agents, and members', () => {
    const team: Team = {
      teamId: 'ops',
      agentKey: 'alpha',
      agentKeys: ['beta', 'gamma'],
      agents: ['delta', { key: 'epsilon' }, { agentKey: 'beta' }],
      members: [{ agentKey: 'zeta' }, { key: 'eta' }, 'theta'],
    };

    expect(readTeamAgentKeys(team)).toEqual([
      'alpha',
      'beta',
      'gamma',
      'delta',
      'epsilon',
      'zeta',
      'eta',
      'theta',
    ]);
  });

  it('splits comma separated values and trims blanks', () => {
    const team: Team = {
      teamId: 'ops',
      agentKey: 'alpha, beta， gamma',
      members: ['delta, epsilon'],
    };

    expect(readTeamAgentKeys(team)).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  });
});

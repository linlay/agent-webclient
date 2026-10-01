import type { AgentSkill, AgentSkillPackage } from '@/shared/data/api/dto/agents';
import { packageMembers, setPackageSelection, skillIdentity, groupSelectedPackages } from './skillPackages';
import { getFilteredSlashPackages } from './slashCommands';

const word: AgentSkill = { id: 'office/word', displayName: '文档', configured: false };
const pkg: AgentSkillPackage = { id: 'office', displayName: '办公', skills: [{ id: word.id }], missingSkillIds: [], status: 'ready' };

test('missing or non-string identities cannot crash package matching or match one another', () => {
  const invalid = [{ configured: false }, { id: null }, { id: 42 }, null] as unknown as AgentSkill[];
  expect(skillIdentity(undefined)).toBe('');
  expect(packageMembers(pkg, [...invalid, word])).toEqual([word]);
  expect(packageMembers({ ...pkg, skills: [{ id: undefined as unknown as string }] }, invalid)).toEqual([]);
  expect(getFilteredSlashPackages('', [pkg], invalid)[0]).toMatchObject({ disabled: true, members: [] });
});

test('id-based package choices retain member identities for grouping and sending', () => {
  const choice = getFilteredSlashPackages('', [pkg], [word])[0];
  expect(choice).toMatchObject({ id: 'office', disabled: false, members: [word] });
  const selected = setPackageSelection([], choice.members, true, [], choice.pkg.id);
  expect(selected).toEqual([{ id: word.id, label: '文档', selectedViaPackageId: 'office' }]);
  expect(selected.map(skill => skill.id)).toEqual(['office/word']);
  expect(groupSelectedPackages([pkg], selected)).toEqual({ groups: [{ pkg, members: selected }], standalone: [] });
});

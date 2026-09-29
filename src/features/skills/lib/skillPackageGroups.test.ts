import { groupAdminSkills } from './skillPackageGroups';
import type { AdminSkillSummary, AdminSkillPackageSummary } from '@/shared/data/api/dto/skills';
const skills: AdminSkillSummary[] = [
  { key: 'meeting', name: '会议管理', status: 'ready', packageId: 'wecom' },
  { key: 'docs', name: '文档', status: 'invalid', packageId: 'wecom' },
  { key: 'solo', name: '独立技能', status: 'ready' },
];
const packages: AdminSkillPackageSummary[] = [{ id: 'wecom', name: '企业微信', version: '1', sha256: '', installedAt: 0, skills: [{ id: 'meeting' }, { id: 'docs' }, { id: 'missing' }] }];
test('groups owned members once and keeps missing rows visible', () => {
  const grouped = groupAdminSkills(skills, packages, '', 'all');
  expect(grouped.standalone.map(s => s.key)).toEqual(['solo']);
  expect(grouped.packages[0].members.map(s => s.id)).toEqual(['meeting', 'docs', 'missing']);
  expect(grouped.packages[0].members[2].skill).toBeUndefined();
});
test('searching member retains parent and limits children', () => {
  const grouped = groupAdminSkills(skills, packages, '会议', 'all');
  expect(grouped.packages[0].pack.id).toBe('wecom');
  expect(grouped.packages[0].members.map(s => s.id)).toEqual(['meeting']);
});
test('searching package shows all children subject to status filter', () => {
  expect(groupAdminSkills(skills, packages, '企业微信', 'ready').packages[0].members.map(s => s.id)).toEqual(['meeting']);
});
test('failed package list does not misclassify owned skills as standalone', () => {
  expect(groupAdminSkills(skills, [], '', 'all').standalone.map(s => s.key)).toEqual(['solo']);
});
test('legacy list without packageId still groups by authoritative manifest', () => {
  expect(groupAdminSkills(skills.map(({packageId, ...s}) => s), packages, '', 'all').standalone.map(s => s.key)).toEqual(['solo']);
});

test('search matches displayName from the current contract', () => {
  const result = groupAdminSkills([{ ...skills[0], name: 'meeting', displayName: '中文会议名称' }], packages, '中文会议', 'all');
  expect(result.packages[0].members.map(s => s.id)).toEqual(['meeting']);
});

test('nested members and independent same-name skills retain separate identities', () => {
  const nested: AdminSkillSummary = { key: 'wecom/meeting', name: 'meeting', displayName: '包内会议', status: 'ready', packageId: 'wecom' };
  const standalone: AdminSkillSummary = { key: 'meeting', name: 'meeting', displayName: '独立会议', status: 'ready' };
  const pack: AdminSkillPackageSummary = { id: 'wecom', name: 'wecom', displayName: '企业微信', skills: [{ id: 'wecom/meeting', name: 'meeting' }] };
  const result = groupAdminSkills([standalone, nested], [pack], '', 'all');
  expect(result.standalone).toEqual([standalone]);
  expect(result.packages[0].members[0].skill).toEqual(nested);
  expect(groupAdminSkills([standalone, nested], [pack], '企业微信', 'all').packages).toHaveLength(1);
});

 test('empty packages remain discoverable by identity and display name', () => {
  const empty: AdminSkillPackageSummary = { id: 'office-suite', displayName: '办公技能包', skills: [] };
  for (const query of ['', 'office-suite', '办公']) {
   expect(groupAdminSkills([], [empty], query, 'all').packages).toEqual([{pack: empty, members: []}]);
  }
  expect(groupAdminSkills([], [empty], 'unmatched', 'all').packages).toEqual([]);
  expect(groupAdminSkills([], [empty], '办公', 'ready').packages).toEqual([]);
 });

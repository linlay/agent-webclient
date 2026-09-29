import { getAdminSkillPackageManifest, saveAdminSkillPackageManifest, deleteAdminSkillPackageMember } from './skillPackages';
import { getAdminSkillDetail } from './skills';
import { requestJson, postJson } from '@/shared/data/api/http';
jest.mock('@/shared/data/api/http', () => ({...jest.requireActual('@/shared/data/api/http'), requestJson: jest.fn(), postJson: jest.fn()}));
beforeEach(() => jest.clearAllMocks());
test('skill detail keeps the full package/member identity in an encoded query', () => {
  getAdminSkillDetail('office/word');
  expect(requestJson).toHaveBeenCalledWith('/api/admin/skills/detail?key=office%2Fword');
});
test('member deletion never reduces the key to its standalone basename', () => {
  deleteAdminSkillPackageMember('office', 'office/word');
  expect(postJson).toHaveBeenCalledWith('/api/admin/skill-packages/skills/delete', {packageId: 'office', skillId: 'office/word'});
});
test('package source reads and writes use the shared endpoint and preserve member order and reviewed hash', () => {
  getAdminSkillPackageManifest('office');
  expect(requestJson).toHaveBeenCalledWith('/api/admin/source?type=skill-package&key=office');
  const content = JSON.stringify({name: 'office', skills: [{key: 'word'}, {key: 'excel'}]});
  saveAdminSkillPackageManifest('office', content, 'abc');
  expect(requestJson).toHaveBeenLastCalledWith('/api/admin/source', {
    method: 'PUT',
    body: JSON.stringify({target: {type: 'skill-package', key: 'office'}, content, baseSha256: 'abc'}),
  });
});

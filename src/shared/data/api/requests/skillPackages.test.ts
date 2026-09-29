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
test('manifest writes use PUT and bind the reviewed hash', () => {
  getAdminSkillPackageManifest('office');
  expect(requestJson).toHaveBeenCalledWith('/api/admin/skill-packages/manifest?key=office');
  saveAdminSkillPackageManifest('office', '{"name":"office"}', 'abc');
  expect(requestJson).toHaveBeenLastCalledWith('/api/admin/skill-packages/manifest', {method: 'PUT', body: '{"key":"office","content":"{\\"name\\":\\"office\\"}","baseSha256":"abc"}'});
});

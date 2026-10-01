/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { SkillConsole } from './SkillConsole';
import { I18nProvider } from '@/shared/i18n';
import { getAdminSkills, getAdminSkillDetail, putAdminSkillPin } from '@/shared/data';
import type { AdminSkillsResponse, AdminSkillDetailResponse, AdminSkillSummary } from '@/shared/data';
import { getAgentSkills } from '@/shared/data/api/routedClient';
import { dataQueryCache } from '@/shared/data/query/serverState';
jest.mock('@/shared/data', () => ({ ...jest.requireActual('@/shared/data'), getAdminSkills: jest.fn(), getAdminSkillDetail: jest.fn(), putAdminSkillPin: jest.fn() }));
jest.mock('@/shared/data/api/routedClient', () => ({ ...jest.requireActual('@/shared/data/api/routedClient'), getAgentSkills: jest.fn() }));
jest.mock('@/shared/ui/CodeEditor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="skill-editor" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));
const skills = [{ id: 'meeting', name: '会议', status: 'ready' as const, packageId: 'wecom' }, { id: 'solo', name: '独立', status: 'ready' as const }];
const packages = [{ id: 'wecom', name: '企业微信', version: '1', sha256: '', installedAt: 0, skills: [{ id: 'meeting' }, { id: 'lost' }], status: 'incomplete' as const, missingSkillIds: ['lost'] }];
let catalog: AdminSkillsResponse;
let container: HTMLDivElement;
let root: Root;
const onSelect = jest.fn();
const onClear = jest.fn();

function skillDetail(skill: AdminSkillSummary): AdminSkillDetailResponse {
  return {
    skill,
    capabilities: {maxTextBytes: 1024, maxUploadBytes: 1024, canCreate: true, canRename: true, canDelete: true, canUpload: true, canDownload: true},
    fileManifest: {revision: '1', entries: [], counts: {files: 0, directories: 0, textFiles: 0, binaryFiles: 0, totalSize: 0}},
  };
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks(); dataQueryCache.clear();
  catalog = {skills: [], packages: [], pinned: []};
  jest.mocked(getAdminSkills).mockImplementation(async () => ({code: 0, msg: '', data: catalog}));
  catalog.skills = skills;
  catalog.packages = packages;
  catalog.pinned = [];
  jest.mocked(putAdminSkillPin).mockResolvedValue({code: 0, msg: '', data: {pinned: []}});
  jest.mocked(getAdminSkillDetail).mockResolvedValue({code: 0, msg: '', data: skillDetail(skills[0])});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {await act(async () => root.unmount()); container.remove();});
async function mount(selectedSkillId = 'meeting') {
  await act(async () => root.render(
    <I18nProvider locale="zh-CN" persistLocale={false}>
      <SkillConsole selectedSkillId={selectedSkillId} onSelectSkillId={onSelect} onClearSelection={onClear} />
    </I18nProvider>,
  ));
}

function kindButton(kind: 'package' | 'standalone') {
  return container.querySelector<HTMLButtonElement>(`button[data-skill-kind="${kind}"]`)!;
}

function topLevelNames() {
  return [...container.querySelectorAll('.skill-console-list-items > div')]
    .map(node => node.querySelector('.skill-package-folder strong, .skill-console-list-item strong')?.textContent)
    .filter(Boolean);
}

async function search(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[placeholder="搜索技能..."]')!;
  await act(async () => Simulate.change(input, {target: {value}} as any));
}

async function filterStatus(label: string) {
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-console-toolbar button.filter-trigger')!.click());
  const option = [...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')]
    .find(node => node.textContent === label)!;
  expect(option).toBeDefined();
  await act(async () => option.click());
}
test('package click expands members and overview, clicking member reopens existing editor', async () => {
  await mount();
  const folder = container.querySelector<HTMLButtonElement>('.skill-package-folder')!;
  expect(folder.getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelectorAll('.skill-console-list-item')).toHaveLength(1);
  await act(async () => folder.click());
  expect(folder.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('.skill-package-overview')?.textContent).toContain('技能包不完整');
  expect(container.querySelector('.skill-package-members')?.textContent).toContain('lost · 缺失');
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-package-members .skill-console-list-item')!.click());
  expect(onSelect).toHaveBeenCalledWith('meeting');
  expect(getAdminSkillDetail).toHaveBeenCalledTimes(2);
  expect(container.querySelector('.skill-package-overview')).toBeNull();
});
test('searching a member automatically expands its parent', async () => {
  await mount();
  const input = container.querySelector<HTMLInputElement>('input[placeholder="搜索技能..."]')!;
  await act(async () => Simulate.change(input, {target: {value: '会议'}} as any));
  expect(container.querySelector('.skill-package-folder')?.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('.skill-package-members')?.textContent).toContain('会议');
  expect(container.querySelector('.skill-console-list-scroll')?.textContent).not.toContain('lost');
});
test('catalog failure is atomic and retry restores grouping', async () => {
  jest.mocked(getAdminSkills).mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('offline');
  expect(container.querySelectorAll('.skill-console-list-item')).toHaveLength(0);
  await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(container.querySelector('.skill-package-folder')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('a packaged skill opens its qualified id without affecting standalone namesake', async () => {
  const nested = { id: 'wecom/meeting', name: 'meeting', displayName: '包内会议', status: 'ready' as const, packageId: 'wecom' };
  catalog.skills = [nested, {id: 'meeting', displayName: '独立会议', status: 'ready'}];
  catalog.packages = [{id: 'wecom', name: 'wecom', displayName: '企业微信', skills: [{id: 'wecom/meeting'}]}];
  await mount();
  expect(container.querySelector('.skill-console-list-scroll')?.textContent).toContain('独立会议');
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-package-folder')!.click());
  expect(container.querySelector('.skill-package-overview')?.textContent).toContain('企业微信');
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-package-members .skill-console-list-item')!.click());
  expect(onSelect).toHaveBeenLastCalledWith('wecom/meeting');
  await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}><SkillConsole selectedSkillId="wecom/meeting" onSelectSkillId={onSelect} onClearSelection={jest.fn()} /></I18nProvider>));
  expect(getAdminSkillDetail).toHaveBeenLastCalledWith('wecom/meeting', 'SKILL.md');
});

test.each([true, false])('mixes packages and standalone names with pins first and no duplicate members (pinned=%s)', async (pinned) => {
  catalog.skills = [
    skills[0],
    {id: 'omega', displayName: 'Omega skill', status: 'ready'},
    {id: 'beta', displayName: 'Beta skill', status: 'ready'},
  ];
  catalog.packages = [
    {...packages[0], displayName: 'Zeta package'},
    {id: 'alpha', displayName: 'Alpha package', skills: []},
  ];
  catalog.pinned = pinned ? ['meeting', 'omega', 'wecom', 'beta'] : [];
  await mount();
  expect(topLevelNames()).toEqual(pinned
    ? ['Omega skill', 'Zeta package', 'Beta skill', 'Alpha package']
    : ['Alpha package', 'Beta skill', 'Omega skill', 'Zeta package']);
  expect(kindButton('package').getAttribute('aria-pressed')).toBe('false');
  expect(kindButton('standalone').getAttribute('aria-pressed')).toBe('false');
  expect(kindButton('package').textContent).toBe('技能包2');
  expect(kindButton('standalone').textContent).toBe('技能2');
  expect(container.querySelector('.skill-console-list-header')).toBeNull();
  const folder = [...container.querySelectorAll<HTMLButtonElement>('.skill-package-folder')]
    .find(node => node.textContent?.includes('Zeta package'))!;
  await act(async () => folder.click());
  expect([...container.querySelectorAll('.skill-console-list-item strong')].map(node => node.textContent))
    .toEqual(pinned ? ['Omega skill', '会议', 'Beta skill'] : ['Beta skill', 'Omega skill', '会议']);
  expect(container.querySelectorAll('.skill-package-members .skill-console-list-item')).toHaveLength(1);
});

test('kind toggles are mutually exclusive and clicking the active kind restores all rows', async () => {
  await mount();
  expect(topLevelNames()).toEqual(['独立', '企业微信']);
  await act(async () => kindButton('package').click());
  expect(topLevelNames()).toEqual(['企业微信']);
  expect(kindButton('package').getAttribute('aria-pressed')).toBe('true');
  expect(kindButton('standalone').getAttribute('aria-pressed')).toBe('false');
  expect(kindButton('standalone').textContent).toBe('技能1');

  await act(async () => kindButton('standalone').click());
  expect(topLevelNames()).toEqual(['独立']);
  expect(kindButton('package').getAttribute('aria-pressed')).toBe('false');
  expect(kindButton('standalone').getAttribute('aria-pressed')).toBe('true');
  await act(async () => kindButton('standalone').click());
  expect(topLevelNames()).toEqual(['独立', '企业微信']);
  expect(kindButton('standalone').getAttribute('aria-pressed')).toBe('false');

  await act(async () => kindButton('package').click());
  await act(async () => kindButton('package').click());
  expect(topLevelNames()).toEqual(['独立', '企业微信']);
  expect(kindButton('package').getAttribute('aria-pressed')).toBe('false');
  expect(onSelect).not.toHaveBeenCalled();
  expect(onClear).not.toHaveBeenCalled();
  expect(getAdminSkillDetail).toHaveBeenCalledTimes(1);
});

test('kind filtering intersects search and status while counts cover both matching kinds', async () => {
  catalog.skills = [
    ...skills, {id: 'report', displayName: '会议报告', status: 'invalid'},
  ];
  await mount();
  await search('会议');
  expect(topLevelNames()).toEqual(['会议报告', '企业微信']);
  expect(kindButton('package').textContent).toBe('技能包1');
  expect(kindButton('standalone').textContent).toBe('技能1');
  expect(container.querySelector('.skill-package-folder')?.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('.skill-package-members')?.textContent).toContain('会议');

  await act(async () => kindButton('package').click());
  expect(topLevelNames()).toEqual(['企业微信']);
  expect(kindButton('standalone').textContent).toBe('技能1');
  await filterStatus('就绪');
  expect(kindButton('package').textContent).toBe('技能包1');
  expect(kindButton('standalone').textContent).toBe('技能0');
  await act(async () => kindButton('standalone').click());
  expect(topLevelNames()).toEqual([]);
  expect(container.querySelector('.skill-console-list-scroll')?.textContent).toContain('无匹配技能');
  expect(container.querySelector<HTMLInputElement>('input[placeholder="搜索技能..."]')?.value).toBe('会议');
  expect(kindButton('package').textContent).toBe('技能包1');

  await filterStatus('全部');
  expect(topLevelNames()).toEqual(['会议报告']);
  expect(kindButton('standalone').getAttribute('aria-pressed')).toBe('true');
  await act(async () => kindButton('standalone').click());
  expect(topLevelNames()).toEqual(['会议报告', '企业微信']);
});

test('empty packages remain visible in package filtering and respect search', async () => {
  catalog.packages = [
    {id: 'empty', displayName: '空技能包', skills: []},
  ];
  catalog.skills = [skills[1]];
  await mount('solo');
  await act(async () => kindButton('package').click());
  expect(topLevelNames()).toEqual(['空技能包']);
  expect(kindButton('package').textContent).toBe('技能包1');
  expect(kindButton('standalone').textContent).toBe('技能1');
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-package-folder')!.click());
  expect(container.querySelector('.skill-package-folder')?.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelectorAll('.skill-package-members .skill-console-list-item')).toHaveLength(0);
  await search('空技能包');
  expect(topLevelNames()).toEqual(['空技能包']);
  expect(kindButton('standalone').textContent).toBe('技能0');
  await search('missing');
  expect(topLevelNames()).toEqual([]);
  expect(kindButton('package').textContent).toBe('技能包0');
});

test('filtering and package pinning preserve the selected skill and its unsaved file', async () => {
  const detail = skillDetail(skills[1]);
  detail.fileManifest.entries = [{
    path: 'SKILL.md', name: 'SKILL.md', kind: 'file', parentPath: '', depth: 0, order: 0,
    contentKind: 'text', editable: true, downloadable: true, uploadable: true, renamable: false, deletable: false,
  }];
  detail.openedFile = {id: 'solo', path: 'SKILL.md', content: 'original', encoding: 'utf-8', sha256: '1', size: 8, editable: true};
  jest.mocked(getAdminSkillDetail).mockResolvedValue({code: 0, msg: '', data: detail});
  await mount('solo');
  const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="skill-editor"]')!;
  await act(async () => Simulate.change(editor, {target: {value: 'unsaved draft'}} as any));
  expect(container.querySelector('.skill-console-dirty')).not.toBeNull();

  jest.mocked(putAdminSkillPin).mockResolvedValue({code: 0, msg: '', data: {pinned: ['wecom']}});
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-package-pin')!.click());
  expect(putAdminSkillPin).toHaveBeenCalledWith({id: 'wecom', pinned: true});
  expect(editor.value).toBe('unsaved draft');
  expect(container.querySelector('.skill-console-dirty')).not.toBeNull();

  await act(async () => kindButton('package').click());
  expect(topLevelNames()).toEqual(['企业微信']);
  expect(editor.value).toBe('unsaved draft');
  expect(container.querySelector('.skill-console-dirty')).not.toBeNull();
  expect(document.querySelector('.ant-modal-confirm')).toBeNull();
  await act(async () => kindButton('standalone').click());
  expect(container.querySelector('.skill-console-list-item.is-active strong')?.textContent).toBe('独立');
  await act(async () => kindButton('standalone').click());
  expect(editor.value).toBe('unsaved draft');
  expect(container.querySelector('.skill-console-dirty')).not.toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
  expect(onClear).not.toHaveBeenCalled();
  expect(getAdminSkillDetail).toHaveBeenCalledTimes(1);
});

test('pinning a package moves the intact row in the shared order without opening or selecting it', async () => {
  let pinned = ['solo'];
  jest.mocked(getAgentSkills).mockImplementation(async () => ({code: 0, msg: '', data: {pinned: [...pinned]}}));
  jest.mocked(putAdminSkillPin).mockImplementation(async request => {
    pinned = pinned.filter(id => id !== request.id);
    if (request.pinned) pinned.unshift(request.id);
    return {code: 0, msg: '', data: {pinned: [...pinned]}};
  });
  await mount('solo');
  const folder = container.querySelector<HTMLButtonElement>('.skill-package-folder')!;
  const pinButton = container.querySelector<HTMLButtonElement>('.skill-package-pin')!;
  expect(topLevelNames()).toEqual(['独立', '企业微信']);
  expect(pinButton.getAttribute('aria-pressed')).toBe('false');
  await act(async () => pinButton.click());
  expect(putAdminSkillPin).toHaveBeenCalledTimes(1);
  expect(putAdminSkillPin).toHaveBeenLastCalledWith({id: 'wecom', pinned: true});
  expect(topLevelNames()).toEqual(['企业微信', '独立']);
  expect(pinButton.getAttribute('aria-pressed')).toBe('true');
  expect(folder.getAttribute('aria-expanded')).toBe('false');
  expect(folder.getAttribute('aria-current')).toBe('false');
  expect(container.querySelector('.skill-package-members')).toBeNull();
  expect(container.querySelector('.skill-package-overview')).toBeNull();
  expect(container.querySelector('button button')).toBeNull();

  await act(async () => pinButton.click());
  expect(putAdminSkillPin).toHaveBeenCalledTimes(2);
  expect(putAdminSkillPin).toHaveBeenLastCalledWith({id: 'wecom', pinned: false});
  expect(topLevelNames()).toEqual(['独立', '企业微信']);
  expect(pinButton.getAttribute('aria-pressed')).toBe('false');
  expect(onSelect).not.toHaveBeenCalled();
  expect(onClear).not.toHaveBeenCalled();
  expect(getAdminSkillDetail).toHaveBeenCalledTimes(1);
});

test('a pending package pin disables duplicate writes and failure preserves the previous order', async () => {
  let rejectPin!: (error: Error) => void;
  jest.mocked(putAdminSkillPin).mockImplementationOnce(() => new Promise((_, reject) => { rejectPin = reject; }));
  await mount();
  const pinButton = container.querySelector<HTMLButtonElement>('.skill-package-pin')!;
  await act(async () => pinButton.click());
  expect(pinButton.disabled).toBe(true);
  await act(async () => pinButton.click());
  expect(putAdminSkillPin).toHaveBeenCalledTimes(1);
  await act(async () => rejectPin(new Error('offline')));
  expect(pinButton.disabled).toBe(false);
  expect(pinButton.getAttribute('aria-pressed')).toBe('false');
  expect(topLevelNames()).toEqual(['独立', '企业微信']);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('无法同步技能置顶');
  expect(onSelect).not.toHaveBeenCalled();
});

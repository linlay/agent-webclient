/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { SkillConsole } from './SkillConsole';
import { I18nProvider } from '@/shared/i18n';
import { getAdminSkills, getAdminSkillDetail, getAdminSkillPackages } from '@/shared/data';
import { getAgentSkills } from '@/shared/data/api/routedClient';
import { dataQueryCache } from '@/shared/data/query/serverState';
jest.mock('@/shared/data', () => ({ ...jest.requireActual('@/shared/data'), getAdminSkills: jest.fn(), getAdminSkillDetail: jest.fn(), getAdminSkillPackages: jest.fn() }));
jest.mock('@/shared/data/api/routedClient', () => ({ ...jest.requireActual('@/shared/data/api/routedClient'), getAgentSkills: jest.fn() }));
jest.mock('@/shared/ui/CodeEditor', () => ({ CodeEditor: () => null }));
const skills = [{ key: 'meeting', name: '会议', status: 'ready' as const, packageId: 'wecom' }, { key: 'solo', name: '独立', status: 'ready' as const }];
const packages = [{ id: 'wecom', name: '企业微信', version: '1', sha256: '', installedAt: 0, skills: [{ id: 'meeting' }, { id: 'lost' }], status: 'incomplete' as const, missingSkillIds: ['lost'] }];
let container: HTMLDivElement;
let root: Root;
const onSelect = jest.fn();
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks(); dataQueryCache.clear();
  jest.mocked(getAdminSkills).mockResolvedValue({code: 0, msg: '', data: skills});
  jest.mocked(getAdminSkillPackages).mockResolvedValue({code: 0, msg: '', data: packages});
  jest.mocked(getAgentSkills).mockResolvedValue({code: 0, msg: '', data: {agentKey: '', skills: [], pinned: []}});
  jest.mocked(getAdminSkillDetail).mockResolvedValue({code: 0, msg: '', data: {
    skill: skills[0], capabilities: {maxTextBytes: 1024, maxUploadBytes: 1024, canCreate: true, canRename: true, canDelete: true, canUpload: true, canDownload: true},
    fileManifest: {revision: '1', entries: [], counts: {files: 0, directories: 0, textFiles: 0, binaryFiles: 0, totalSize: 0}},
  }});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {await act(async () => root.unmount()); container.remove();});
async function mount() {await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}><SkillConsole selectedSkillKey="meeting" onSelectSkillKey={onSelect} onClearSelection={jest.fn()} /></I18nProvider>));}
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
test('package fetch error is explicit and retry restores grouping', async () => {
  jest.mocked(getAdminSkillPackages).mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('技能包列表加载失败');
  expect(container.querySelectorAll('.skill-console-list-item')).toHaveLength(1);
  await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(container.querySelector('.skill-package-folder')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('a packaged skill opens its qualified key without affecting standalone namesake', async () => {
  const nested = { key: 'wecom/meeting', name: 'meeting', displayName: '包内会议', status: 'ready' as const, packageId: 'wecom' };
  jest.mocked(getAdminSkills).mockResolvedValue({code: 0, msg: '', data: [nested, {key: 'meeting', displayName: '独立会议', status: 'ready'}]});
  jest.mocked(getAdminSkillPackages).mockResolvedValue({code: 0, msg: '', data: [{id: 'wecom', name: 'wecom', displayName: '企业微信', skills: [{id: 'wecom/meeting'}]}]});
  await mount();
  expect(container.querySelector('.skill-console-list-scroll')?.textContent).toContain('独立会议');
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-package-folder')!.click());
  expect(container.querySelector('.skill-package-overview')?.textContent).toContain('企业微信');
  await act(async () => container.querySelector<HTMLButtonElement>('.skill-package-members .skill-console-list-item')!.click());
  expect(onSelect).toHaveBeenLastCalledWith('wecom/meeting');
  await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}><SkillConsole selectedSkillKey="wecom/meeting" onSelectSkillKey={onSelect} onClearSelection={jest.fn()} /></I18nProvider>));
  expect(getAdminSkillDetail).toHaveBeenLastCalledWith('wecom/meeting', 'SKILL.md');
});

 test.each([true, false])('pinned standalone skills precede packages without duplicate rows (pinned=%s)', async (pinned) => {
  jest.mocked(getAgentSkills).mockResolvedValue({code: 0, msg: '', data: {agentKey: '', skills: [], pinned: pinned ? ['solo'] : []}});
  await mount();
  const rows = [...container.querySelectorAll('.skill-console-list-scroll .skill-package-folder, .skill-console-list-scroll .skill-console-list-item')];
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain(pinned ? '独立' : '企业微信');
  expect(rows[1].textContent).toContain(pinned ? '企业微信' : '独立');
 });
